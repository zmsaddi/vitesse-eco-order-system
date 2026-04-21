import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// D-58 immutability triggers (`invoices_no_update`, `invoice_lines_no_update`)
// are a parallel defense — they reject UPDATEs from every ordinary writer.
// The hash chain is a SEPARATE line of defense for the case where an
// attacker or privileged operator bypasses the trigger (drops it, uses
// superuser, or restores from a tampered dump). To prove the chain actually
// detects tampering, the negative tests here explicitly disable the relevant
// trigger for the duration of a single UPDATE, then re-enable it before
// leaving the tx.
const TRIGGERS = {
  invoices: "invoices_no_update",
  invoice_lines: "invoice_lines_no_update",
} as const;

async function tamperWithTriggerBypass(
  table: keyof typeof TRIGGERS,
  updateSql: string,
): Promise<void> {
  const { withTxInRoute } = await import("@/db/client");
  const trigger = TRIGGERS[table];
  await withTxInRoute(undefined, async (tx) => {
    try {
      await tx.execute(
        sql.raw(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`),
      );
      await tx.execute(sql.raw(updateSql));
    } finally {
      await tx.execute(
        sql.raw(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`),
      );
    }
  });
}

// Parameterised tamper variant — identical trigger-bypass semantics but lets
// the caller pass a drizzle `sql` template with bound parameters, so we can
// safely restore arbitrary-string originals without manual quoting.
async function tamperParamTriggerBypass(
  table: keyof typeof TRIGGERS,
  updateSql: ReturnType<typeof sql>,
): Promise<void> {
  const { withTxInRoute } = await import("@/db/client");
  const trigger = TRIGGERS[table];
  await withTxInRoute(undefined, async (tx) => {
    try {
      await tx.execute(
        sql.raw(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`),
      );
      await tx.execute(updateSql);
    } finally {
      await tx.execute(
        sql.raw(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`),
      );
    }
  });
}

// Phase 4.1.2 — D-37 canonical completeness + invoice_lines hash chain.
//
// Negative-first: tests T1..T4 tamper with a frozen column DIRECTLY via SQL
// (bypassing the D-58 immutability trigger by targeting the JSONB columns or
// the pre-chain fields) and assert that verifyInvoicesChain /
// verifyInvoiceLinesChain return the offending row id. Only after we've
// proven the chain CAN fail do T5..T7 assert the happy paths.
//
// Contract reminder: the two verifiers read ONLY from `invoices` +
// `invoice_lines`. They never touch `settings`, `payments`, `clients`, or
// `products`. Any test-level mutation of those live tables must NOT affect
// the verifier outcome for an already-issued invoice.

describe.skipIf(!HAS_DB)("Phase 4.1.2 — D-37 completeness (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let driverId: number;
  let clientId: number;
  let productId: number;
  let giftProductId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    delete process.env.INIT_BOOTSTRAP_SECRET;
    await resetSchema();
    await applyMigrations();

    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    const { POST: initPost } = await import("@/app/api/init/route");
    await initPost(new Request("http://localhost/api/init", { method: "POST" }) as never);

    const { withRead, withTxInRoute } = await import("@/db/client");
    const {
      users,
      clients,
      giftPool,
      products,
      settings,
      productCommissionRules,
    } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    const hash = await hashPassword("test-pass-4.1.2");
    [sellerId, driverId] = await withTxInRoute(undefined, async (tx) => {
      const s = await tx
        .insert(users)
        .values({ username: "sel-412", password: hash, name: "Seller 412", role: "seller", active: true })
        .returning();
      const wired = await wireManagerAndDrivers(tx, {
        managerSuffix: "p412",
        driverSuffixes: ["412"],
        passwordHash: hash,
      });
      return [s[0].id, wired.driverIds[0]];
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({
            name: "Client 412",
            phone: "+33600412001",
            email: "c412@example.fr",
            address: "1 Rue 412",
            createdBy: "admin",
          })
          .returning(),
      )
    )[0].id;

    [productId, giftProductId] = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "Produit 412",
          category: "cat-412",
          buyPrice: "40.00",
          sellPrice: "100.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      const gp = await tx
        .insert(products)
        .values({
          name: "Cadeau 412",
          category: "cat-412",
          buyPrice: "5.00",
          sellPrice: "50.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      await tx
        .insert(giftPool)
        .values({ productId: gp[0].id, quantity: "20", createdBy: "admin" });

      const ops = [
        { key: "max_discount_seller_pct", value: "5" },
        { key: "seller_bonus_fixed", value: "0" },
        { key: "seller_bonus_percentage", value: "0" },
        { key: "driver_bonus_fixed", value: "0" },
        ...D35_SEED_SETTINGS,
      ];
      for (const s of ops) {
        await tx
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
      }
      await tx
        .insert(productCommissionRules)
        .values({
          category: "cat-412",
          sellerFixedPerUnit: "5",
          sellerPctOverage: "10",
          driverFixedPerDelivery: "8",
          active: true,
        })
        .onConflictDoNothing({ target: productCommissionRules.category });
      return [p[0].id, gp[0].id];
    });
  });

  function mockSession(user: { id: number; username: string; role: string; name: string }) {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: {
          id: String(user.id),
          username: user.username,
          role: user.role,
          name: user.name,
        },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshRoutes(user: { id: number; username: string; role: string; name: string }) {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession(user);
    return {
      orders: await import("@/app/api/v1/orders/route"),
      startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
      deliveries: await import("@/app/api/v1/deliveries/route"),
      deliveriesStart: await import("@/app/api/v1/deliveries/[id]/start/route"),
      deliveriesConfirm: await import(
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route"
      ),
    };
  }

  const admin = () => ({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
  const seller = () => ({ id: sellerId, username: "sel-412", role: "seller", name: "Seller" });
  const driver = () => ({ id: driverId, username: "drv-412", role: "driver", name: "Driver" });

  async function issueInvoiceEndToEnd(
    idem: string,
    items: Array<{ productId: number; quantity: number; unitPrice: number; isGift?: boolean }>,
    paidAmount: number,
    paymentMethod: string,
  ): Promise<{ orderId: number; deliveryId: number; invoiceId: number }> {
    const rc = await freshRoutes(seller());
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, date: "2026-04-21", items }),
      }),
    );
    expect(create.status).toBe(201);
    const { order } = (await create.json()) as { order: { id: number } };

    const rsp = await freshRoutes(admin());
    const sp = await rsp.startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `412-sp-${order.id}-${idem}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(sp.status).toBe(200);
    const rmr = await freshRoutes(admin());
    const mr = await rmr.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `412-mr-${order.id}-${idem}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(mr.status).toBe(200);

    const rcd = await freshRoutes(admin());
    const cd = await rcd.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, assignedDriverId: driverId }),
      }),
    );
    expect(cd.status).toBe(201);
    const { delivery } = (await cd.json()) as { delivery: { id: number } };

    const rs = await freshRoutes(driver());
    const start = await rs.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `412-dstart-${delivery.id}-${idem}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(start.status).toBe(200);

    const rcf = await freshRoutes(driver());
    const confirm = await rcf.deliveriesConfirm.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `412-cfm-${delivery.id}-${idem}`,
        },
        body: JSON.stringify({ paidAmount, paymentMethod }),
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(confirm.status).toBe(200);
    const cb = (await confirm.json()) as { invoiceId: number };
    return { orderId: order.id, deliveryId: delivery.id, invoiceId: cb.invoiceId };
  }

  // Helper: run the two verifiers inside a single read tx.
  async function verifyBothChains(): Promise<{ invoices: number | null; lines: number | null }> {
    const { withTxInRoute } = await import("@/db/client");
    const { verifyInvoicesChain, verifyInvoiceLinesChain } = await import(
      "@/modules/invoices/chain"
    );
    return withTxInRoute(undefined, async (tx) => {
      const invBad = await verifyInvoicesChain(tx);
      const lineBad = await verifyInvoiceLinesChain(tx);
      return { invoices: invBad, lines: lineBad };
    });
  }

  // ─────────────── T0 — row_hash is a real, non-empty hex ───────────────

  it("T0: every line inserted by issueInvoiceInTx carries a real sha256 row_hash (64-hex), not the DEFAULT ''", async () => {
    await issueInvoiceEndToEnd(
      "t0",
      [{ productId, quantity: 2, unitPrice: 100 }],
      200,
      "كاش",
    );

    const { withRead } = await import("@/db/client");
    const { invoiceLines, invoices } = await import("@/db/schema");
    const lineRows = await withRead(undefined, (db) => db.select().from(invoiceLines));
    const invRows = await withRead(undefined, (db) => db.select().from(invoices));

    expect(lineRows.length).toBeGreaterThan(0);
    const hex64 = /^[0-9a-f]{64}$/;
    for (const l of lineRows) {
      expect(l.rowHash).toMatch(hex64);
      // first line in the global chain has prev_hash NULL; later lines have
      // a hex sibling. either way it must not be empty string.
      if (l.prevHash !== null) expect(l.prevHash).toMatch(hex64);
    }
    for (const iv of invRows) {
      expect(iv.rowHash).toMatch(hex64);
      if (iv.prevHash !== null) expect(iv.prevHash).toMatch(hex64);
    }
  });

  // ─────────────── T1 — vendor_snapshot tamper ───────────────

  it("T1 negative: tampering with vendor_snapshot.shopIban after issue → verifyInvoicesChain reports the row", async () => {
    const { invoiceId } = await issueInvoiceEndToEnd(
      "t1",
      [{ productId, quantity: 1, unitPrice: 100 }],
      100,
      "كاش",
    );

    const cleanBefore = await verifyBothChains();
    expect(cleanBefore.invoices).toBeNull();
    expect(cleanBefore.lines).toBeNull();

    // Capture the original IBAN so we can restore after the negative check
    // — chain verification walks from genesis, so any leftover tamper would
    // break subsequent tests.
    const { withTxInRoute } = await import("@/db/client");
    const originalIban = await withTxInRoute(undefined, async (tx) => {
      const res = await tx.execute(
        sql.raw(
          `SELECT vendor_snapshot->>'shopIban' AS iban FROM invoices WHERE id = ${invoiceId}`,
        ),
      );
      return (res as unknown as { rows?: Array<{ iban: string }> }).rows?.[0]?.iban ?? "";
    });

    try {
      await tamperWithTriggerBypass(
        "invoices",
        `UPDATE invoices SET vendor_snapshot = jsonb_set(vendor_snapshot, '{shopIban}', '"HACKED_IBAN"') WHERE id = ${invoiceId}`,
      );

      const result = await verifyBothChains();
      expect(result.invoices).toBe(invoiceId);
      // lines chain is independent — tampering only the invoices row does not
      // corrupt the invoice_lines chain.
      expect(result.lines).toBeNull();
    } finally {
      await tamperParamTriggerBypass(
        "invoices",
        sql`UPDATE invoices SET vendor_snapshot = jsonb_set(vendor_snapshot, '{shopIban}', to_jsonb(${originalIban}::text)) WHERE id = ${invoiceId}`,
      );
    }

    // Chain must be clean again so subsequent tests start from a verifiable
    // genesis.
    const cleanAfter = await verifyBothChains();
    expect(cleanAfter.invoices).toBeNull();
    expect(cleanAfter.lines).toBeNull();
  });

  // ─────────────── T2 — payments_history tamper ───────────────

  it("T2 negative: tampering with payments_history[0].amount after issue → verifyInvoicesChain reports the row", async () => {
    const { invoiceId } = await issueInvoiceEndToEnd(
      "t2",
      [{ productId, quantity: 1, unitPrice: 100 }],
      100,
      "كاش",
    );

    expect((await verifyBothChains()).invoices).toBeNull();

    const { withTxInRoute } = await import("@/db/client");
    const originalAmount = await withTxInRoute(undefined, async (tx) => {
      const res = await tx.execute(
        sql.raw(
          `SELECT payments_history->0->>'amount' AS amt FROM invoices WHERE id = ${invoiceId}`,
        ),
      );
      return (res as unknown as { rows?: Array<{ amt: string }> }).rows?.[0]?.amt ?? "";
    });

    try {
      await tamperWithTriggerBypass(
        "invoices",
        `UPDATE invoices SET payments_history = jsonb_set(payments_history, '{0,amount}', '"1.00"') WHERE id = ${invoiceId}`,
      );

      const result = await verifyBothChains();
      expect(result.invoices).toBe(invoiceId);
    } finally {
      await tamperParamTriggerBypass(
        "invoices",
        sql`UPDATE invoices SET payments_history = jsonb_set(payments_history, '{0,amount}', to_jsonb(${originalAmount}::text)) WHERE id = ${invoiceId}`,
      );
    }

    const cleanAfter = await verifyBothChains();
    expect(cleanAfter.invoices).toBeNull();
    expect(cleanAfter.lines).toBeNull();
  });

  // ─────────────── T3 — invoice_lines tamper → lines chain ───────────────

  it("T3 negative: tampering with invoice_lines.line_total_ttc_frozen → verifyInvoiceLinesChain reports the row", async () => {
    const { invoiceId } = await issueInvoiceEndToEnd(
      "t3",
      [{ productId, quantity: 1, unitPrice: 100 }],
      100,
      "كاش",
    );

    expect((await verifyBothChains()).lines).toBeNull();

    const { withRead } = await import("@/db/client");
    const { invoiceLines } = await import("@/db/schema");
    const lineToTamper = (
      await withRead(undefined, (db) =>
        db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)),
      )
    )[0];
    expect(lineToTamper).toBeDefined();
    const originalLineTotal = lineToTamper.lineTotalTtcFrozen;

    try {
      await tamperWithTriggerBypass(
        "invoice_lines",
        `UPDATE invoice_lines SET line_total_ttc_frozen = '1.00' WHERE id = ${lineToTamper.id}`,
      );

      const result = await verifyBothChains();
      expect(result.lines).toBe(lineToTamper.id);
    } finally {
      await tamperParamTriggerBypass(
        "invoice_lines",
        sql`UPDATE invoice_lines SET line_total_ttc_frozen = ${originalLineTotal} WHERE id = ${lineToTamper.id}`,
      );
    }

    const cleanAfter = await verifyBothChains();
    expect(cleanAfter.invoices).toBeNull();
    expect(cleanAfter.lines).toBeNull();
  });

  // ─────────────── T4 — line tamper → double protection ───────────────

  it("T4 negative: tampering with a line's frozen field ALSO breaks the invoice chain (lines[] is in invoice canonical)", async () => {
    const { invoiceId } = await issueInvoiceEndToEnd(
      "t4",
      [{ productId, quantity: 1, unitPrice: 100 }],
      100,
      "كاش",
    );

    expect((await verifyBothChains()).invoices).toBeNull();

    const { withRead } = await import("@/db/client");
    const { invoiceLines } = await import("@/db/schema");
    const lineToTamper = (
      await withRead(undefined, (db) =>
        db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)),
      )
    )[0];
    const originalHt = lineToTamper.htAmountFrozen;

    try {
      await tamperWithTriggerBypass(
        "invoice_lines",
        `UPDATE invoice_lines SET ht_amount_frozen = '1.00' WHERE id = ${lineToTamper.id}`,
      );

      const result = await verifyBothChains();
      expect(result.invoices).toBe(invoiceId);
      expect(result.lines).toBe(lineToTamper.id);
    } finally {
      await tamperParamTriggerBypass(
        "invoice_lines",
        sql`UPDATE invoice_lines SET ht_amount_frozen = ${originalHt} WHERE id = ${lineToTamper.id}`,
      );
    }

    const cleanAfter = await verifyBothChains();
    expect(cleanAfter.invoices).toBeNull();
    expect(cleanAfter.lines).toBeNull();
  });

  // ─────────────── T5 — happy path (multi-line + gift) ───────────────

  it("T5 happy: multi-line invoice with a gift issues cleanly; both chains verify", async () => {
    await issueInvoiceEndToEnd(
      "t5",
      [
        { productId, quantity: 3, unitPrice: 120 },
        { productId: giftProductId, quantity: 1, unitPrice: 0, isGift: true },
      ],
      360,
      "كاش",
    );

    const result = await verifyBothChains();
    expect(result.invoices).toBeNull();
    expect(result.lines).toBeNull();
  });

  // ─────────────── T6 — idempotency replay ───────────────

  it("T6: idempotency replay produces one invoice; both chains remain clean", async () => {
    const first = await issueInvoiceEndToEnd(
      "t6",
      [{ productId, quantity: 1, unitPrice: 100 }],
      100,
      "كاش",
    );

    // Replay the confirm call with the same key.
    const rcf = await freshRoutes(driver());
    const replay = await rcf.deliveriesConfirm.POST(
      new Request(`http://localhost/api/v1/deliveries/${first.deliveryId}/confirm-delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `412-cfm-${first.deliveryId}-t6`,
        },
        body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
      }),
      { params: Promise.resolve({ id: String(first.deliveryId) }) },
    );
    expect(replay.status).toBe(200);
    const rb = (await replay.json()) as { invoiceId: number };
    expect(rb.invoiceId).toBe(first.invoiceId);

    const { withRead } = await import("@/db/client");
    const { invoices } = await import("@/db/schema");
    const invRows = await withRead(undefined, (db) =>
      db.select().from(invoices).where(eq(invoices.orderId, first.orderId)),
    );
    expect(invRows.length).toBe(1);

    const result = await verifyBothChains();
    expect(result.invoices).toBeNull();
    expect(result.lines).toBeNull();
  });

  // ─────────────── T7 — two back-to-back invoices ───────────────

  it("T7 regression: two sequential invoices keep both chains clean (links + prev_hash propagate)", async () => {
    await issueInvoiceEndToEnd(
      "t7a",
      [{ productId, quantity: 1, unitPrice: 100 }],
      100,
      "كاش",
    );
    await issueInvoiceEndToEnd(
      "t7b",
      [{ productId, quantity: 2, unitPrice: 110 }],
      220,
      "كاش",
    );

    const result = await verifyBothChains();
    expect(result.invoices).toBeNull();
    expect(result.lines).toBeNull();
  });
});
