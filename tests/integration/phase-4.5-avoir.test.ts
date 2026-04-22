import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.5 — Avoir core integration coverage on live Neon.
//
// Flow: every test that needs a parent invoice runs the full confirm-delivery
// pipeline (order → preparation → ready → delivery → start → confirm) so the
// parent is a real, hash-chained invoice.
//
// Coverage (~20 cases):
//   Happy:
//     T-AV-FULL, T-AV-PARTIAL-ONE-LINE, T-AV-PARTIAL-MULTI, T-AV-SEQUENTIAL
//   Negative:
//     T-AV-NEG-NOT-FOUND, T-AV-NEG-CANCELLED-PARENT, T-AV-NEG-AVOIR-ON-AVOIR,
//     T-AV-NEG-LINE-NOT-IN-INVOICE, T-AV-NEG-LINE-DUPLICATE,
//     T-AV-NEG-QTY-EXCEEDS, T-AV-NEG-QTY-EXCEEDS-SEQUENTIAL,
//     T-AV-NEG-REASON-EMPTY, T-AV-NEG-QTY-SUBCENT, T-AV-NEG-EMPTY-LINES
//   D-35:
//     T-AV-NEG-D35
//   Permissions:
//     T-AV-PERM (manager/seller/driver/stock_keeper → 403)
//   Idempotency:
//     T-AV-IDEM
//   Concurrency:
//     T-AV-CONC
//   Chain + D-58:
//     T-AV-CHAIN, T-AV-D58
//   PDF:
//     T-AV-PDF (smoke: 200 + application/pdf + length>0; PDF branch logic is
//     proved unit-level in pdf-header.test.ts)

const D35_GOOD: Array<{ key: string; value: string }> = [
  { key: "shop_name", value: "VITESSE ECO SAS" },
  { key: "shop_legal_form", value: "SAS" },
  { key: "shop_siret", value: "12345678901234" },
  { key: "shop_siren", value: "123456789" },
  { key: "shop_ape", value: "4618Z" },
  { key: "shop_vat_number", value: "FR12345678901" },
  { key: "shop_address", value: "123 Rue de la Paix" },
  { key: "shop_city", value: "86000 Poitiers, France" },
  { key: "shop_email", value: "contact@vitesse-eco.fr" },
  { key: "shop_website", value: "www.vitesse-eco.fr" },
  { key: "shop_iban", value: "FR7610057190010000000000001" },
  { key: "shop_bic", value: "CMBRFR2BARK" },
  { key: "shop_capital_social", value: "10000" },
  { key: "shop_rcs_city", value: "Poitiers" },
  { key: "shop_rcs_number", value: "RCS Poitiers 123 456 789" },
  { key: "shop_penalty_rate_annual", value: "10.5" },
  { key: "shop_recovery_fee_eur", value: "40" },
  { key: "vat_rate", value: "20" },
  { key: "max_discount_seller_pct", value: "5" },
  { key: "seller_bonus_fixed", value: "0" },
  { key: "seller_bonus_percentage", value: "0" },
  { key: "driver_bonus_fixed", value: "0" },
  { key: "driver_custody_cap_eur", value: "100000" },
];

describe.skipIf(!HAS_DB)("Phase 4.5 — Avoir core (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let gmUserId: number;
  let sellerId: number;
  let managerId: number;
  let driverId: number;
  let stockKeeperId: number;
  let clientId: number;
  let productId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ??
      "test-secret-at-least-32-characters-long!!";
    delete process.env.INIT_BOOTSTRAP_SECRET;
    await resetSchema();
    await applyMigrations();

    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    const { POST: initPost } = await import("@/app/api/init/route");
    await initPost(
      new Request("http://localhost/api/init", { method: "POST" }) as never,
    );

    const { withRead, withTxInRoute } = await import("@/db/client");
    const {
      users,
      clients,
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

    const hash = await hashPassword("test-pass-4.5");

    const wired = await withTxInRoute(undefined, (tx) =>
      wireManagerAndDrivers(tx, {
        managerSuffix: "45",
        driverSuffixes: ["45"],
        passwordHash: hash,
      }),
    );
    managerId = wired.managerId;
    driverId = wired.driverIds[0];

    [sellerId, stockKeeperId, gmUserId] = await withTxInRoute(
      undefined,
      async (tx) => {
        const s = await tx
          .insert(users)
          .values({
            username: "sel-45",
            password: hash,
            name: "Seller 45",
            role: "seller",
            active: true,
          })
          .returning();
        const sk = await tx
          .insert(users)
          .values({
            username: "sk-45",
            password: hash,
            name: "SK 45",
            role: "stock_keeper",
            active: true,
          })
          .returning();
        const gm = await tx
          .insert(users)
          .values({
            username: "gm-45",
            password: hash,
            name: "GM 45",
            role: "gm",
            active: true,
          })
          .returning();
        return [s[0].id, sk[0].id, gm[0].id];
      },
    );

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({
            name: "Société Avoir",
            phone: "+33600450001",
            email: "avoir@example.fr",
            address: "45 Avenue de Paris, 75000",
            createdBy: "admin",
          })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "Produit 45",
          category: "cat-45",
          buyPrice: "40.00",
          sellPrice: "100.00",
          stock: "10000.00",
          createdBy: "admin",
        })
        .returning();
      for (const s of D35_GOOD) {
        await tx
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: s.value },
          });
      }
      await tx
        .insert(productCommissionRules)
        .values({
          category: "cat-45",
          sellerFixedPerUnit: "0",
          sellerPctOverage: "0",
          driverFixedPerDelivery: "0",
          active: true,
        })
        .onConflictDoNothing({ target: productCommissionRules.category });
      return p[0].id;
    });
  });

  function mockSession(user: {
    id: number;
    username: string;
    role: string;
    name: string;
  }) {
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

  async function freshRoutes(user: {
    id: number;
    username: string;
    role: string;
    name: string;
  }) {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession(user);
    return {
      orders: await import("@/app/api/v1/orders/route"),
      cancel: await import("@/app/api/v1/orders/[id]/cancel/route"),
      startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
      deliveries: await import("@/app/api/v1/deliveries/route"),
      deliveriesStart: await import("@/app/api/v1/deliveries/[id]/start/route"),
      deliveriesConfirm: await import(
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route"
      ),
      invoicesDetail: await import("@/app/api/v1/invoices/[id]/route"),
      invoicesPdf: await import("@/app/api/v1/invoices/[id]/pdf/route"),
      avoir: await import("@/app/api/v1/invoices/[id]/avoir/route"),
    };
  }

  const admin = () => ({
    id: adminUserId,
    username: "admin",
    role: "pm",
    name: "Admin",
  });
  const gm = () => ({
    id: gmUserId,
    username: "gm-45",
    role: "gm",
    name: "GM",
  });
  const seller = () => ({
    id: sellerId,
    username: "sel-45",
    role: "seller",
    name: "Seller",
  });
  const manager = () => ({
    id: managerId,
    username: "mgr-45",
    role: "manager",
    name: "Manager",
  });
  const driver = () => ({
    id: driverId,
    username: "drv-45",
    role: "driver",
    name: "Driver",
  });
  const sk = () => ({
    id: stockKeeperId,
    username: "sk-45",
    role: "stock_keeper",
    name: "SK",
  });

  type OrderItemInput = {
    productId: number;
    quantity: number;
    unitPrice: number;
    isGift?: boolean;
  };

  async function createConfirmedInvoice(
    itemCountOrItems: number | OrderItemInput[],
    tag: string,
  ): Promise<{
    orderId: number;
    deliveryId: number;
    invoiceId: number;
    invoiceLineIds: number[];
  }> {
    // Separate line items so the invoice has N lines — matches D-29
    // uniqueness semantics (seller bonus per (delivery, order_item)).
    // Default path (number) creates N paid lines at 100€ each. Callers that
    // need gift lines or mixed items pass an explicit items[] array.
    const items: OrderItemInput[] = Array.isArray(itemCountOrItems)
      ? itemCountOrItems
      : Array.from({ length: itemCountOrItems }, () => ({
          productId,
          quantity: 1,
          unitPrice: 100,
        }));
    const orderTotal = items.reduce(
      (sum, it) => sum + it.quantity * it.unitPrice,
      0,
    );
    const rc = await freshRoutes(seller());
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-21",
          paymentMethod: "كاش",
          items,
        }),
      }),
    );
    if (create.status !== 201) {
      throw new Error(
        `createConfirmedInvoice: orders.POST ${create.status} ${await create.text()}`,
      );
    }
    const { order } = (await create.json()) as { order: { id: number } };
    const rsp = await freshRoutes(admin());
    await rsp.startPrep.POST(
      new Request(
        `http://localhost/api/v1/orders/${order.id}/start-preparation`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `45-sp-${order.id}-${tag}` },
        },
      ),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    const rmr = await freshRoutes(admin());
    await rmr.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `45-mr-${order.id}-${tag}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    const rcd = await freshRoutes(admin());
    const cd = await rcd.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          assignedDriverId: driverId,
        }),
      }),
    );
    const { delivery } = (await cd.json()) as { delivery: { id: number } };
    const rs = await freshRoutes(driver());
    await rs.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `45-ds-${delivery.id}-${tag}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    const rcfm = await freshRoutes(driver());
    const cfm = await rcfm.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `45-cfm-${delivery.id}-${tag}`,
          },
          body: JSON.stringify({
            paidAmount: orderTotal,
            paymentMethod: "كاش",
          }),
        },
      ),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    if (cfm.status !== 200) {
      throw new Error(
        `createConfirmedInvoice: confirm ${cfm.status} ${await cfm.text()}`,
      );
    }
    const { invoiceId } = (await cfm.json()) as { invoiceId: number };

    // Resolve line ids for this invoice in line_number order.
    const { withRead } = await import("@/db/client");
    const { invoiceLines } = await import("@/db/schema");
    const lineRows = await withRead(undefined, (db) =>
      db
        .select({ id: invoiceLines.id })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoiceId))
        .orderBy(invoiceLines.lineNumber),
    );
    return {
      orderId: order.id,
      deliveryId: delivery.id,
      invoiceId,
      invoiceLineIds: lineRows.map((r) => r.id),
    };
  }

  async function callIssueAvoir(
    parentId: number,
    claims: ReturnType<typeof admin>,
    body: Record<string, unknown>,
    idem: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.avoir.POST(
      new Request(`http://localhost/api/v1/invoices/${parentId}/avoir`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `45-av-${idem}`,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(parentId) }) },
    );
  }

  // ─────────────────── HAPPY ───────────────────

  it("T-AV-FULL: full reverse of 3-line invoice → avoir with negative totals + 3 avoir lines", async () => {
    const base = await createConfirmedInvoice(3, "full-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "Retour complet de la marchandise",
        lines: base.invoiceLineIds.map((id) => ({
          invoiceLineId: id,
          quantityToCredit: 1,
        })),
      },
      "full-a",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      avoir: { id: number; totalTtcFrozen: string; avoirOfId: number | null; status: string };
      lines: Array<{ quantity: string; lineTotalTtcFrozen: string }>;
      parentInvoiceId: number;
      parentRefCode: string;
    };
    expect(body.avoir.avoirOfId).toBe(base.invoiceId);
    expect(body.avoir.status).toBe("مؤكد");
    expect(Number(body.avoir.totalTtcFrozen)).toBeCloseTo(-300, 2);
    expect(body.lines.length).toBe(3);
    for (const l of body.lines) {
      expect(Number(l.quantity)).toBe(-1);
      expect(Number(l.lineTotalTtcFrozen)).toBeCloseTo(-100, 2);
    }
    expect(body.parentInvoiceId).toBe(base.invoiceId);
    expect(body.parentRefCode.startsWith("FAC-")).toBe(true);
  });

  it("T-AV-PARTIAL-ONE-LINE: refund 0.50 of a 1-quantity line → proportional avoir", async () => {
    const base = await createConfirmedInvoice(1, "partial-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "Retour partiel",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.5 }],
      },
      "partial-a",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      avoir: { totalTtcFrozen: string };
      lines: Array<{ quantity: string; lineTotalTtcFrozen: string }>;
    };
    expect(body.lines.length).toBe(1);
    expect(Number(body.lines[0].quantity)).toBeCloseTo(-0.5, 2);
    expect(Number(body.lines[0].lineTotalTtcFrozen)).toBeCloseTo(-50, 2);
    expect(Number(body.avoir.totalTtcFrozen)).toBeCloseTo(-50, 2);
  });

  it("T-AV-PARTIAL-MULTI: refund 2 of 3 lines with partial qty → totals consistent", async () => {
    const base = await createConfirmedInvoice(3, "multi-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "Retour mixte",
        lines: [
          { invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 },
          { invoiceLineId: base.invoiceLineIds[2], quantityToCredit: 0.25 },
        ],
      },
      "multi-a",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      avoir: { totalTtcFrozen: string };
      lines: Array<{ quantity: string }>;
    };
    expect(body.lines.length).toBe(2);
    // -100 + -25 = -125
    expect(Number(body.avoir.totalTtcFrozen)).toBeCloseTo(-125, 2);
  });

  it("T-AV-SEQUENTIAL: 60% then 40% on same line → running total lands exactly at 100%", async () => {
    const base = await createConfirmedInvoice(1, "seq-a");
    const r1 = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "Retour partiel 1/2",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.6 }],
      },
      "seq-a-1",
    );
    expect(r1.status).toBe(200);
    const r2 = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "Retour partiel 2/2",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.4 }],
      },
      "seq-a-2",
    );
    expect(r2.status).toBe(200);
    const b1 = (await r1.json()) as { avoir: { totalTtcFrozen: string } };
    const b2 = (await r2.json()) as { avoir: { totalTtcFrozen: string } };
    expect(
      Number(b1.avoir.totalTtcFrozen) + Number(b2.avoir.totalTtcFrozen),
    ).toBeCloseTo(-100, 2);
  });

  // ─────────────────── NEGATIVE ───────────────────

  it("T-AV-NEG-NOT-FOUND: id=999999999 → 404 INVOICE_NOT_FOUND-equivalent (NotFoundError → 404)", async () => {
    const res = await callIssueAvoir(
      999999999,
      admin(),
      {
        reason: "ghost",
        lines: [{ invoiceLineId: 1, quantityToCredit: 1 }],
      },
      "notfound",
    );
    expect(res.status).toBe(404);
  });

  it("T-AV-NEG-CANCELLED-PARENT: parent status=ملغي → 409 INVOICE_NOT_ISSUABLE_AVOIR", async () => {
    const base = await createConfirmedInvoice(1, "cnl-a");
    // An invoice cannot be cancelled via the API in this code base (the
    // D-58 trigger invoices_no_update blocks every UPDATE). To exercise the
    // INVOICE_NOT_ISSUABLE_AVOIR branch, we temporarily DISABLE the trigger,
    // flip the parent row to status='ملغي', call the avoir endpoint, assert
    // the 409, then revert the row and re-enable the trigger so follow-on
    // tests observe the intact chain.
    const { withTxInRoute } = await import("@/db/client");
    const { invoices } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    await withTxInRoute(undefined, async (tx) => {
      await tx.execute(sql`ALTER TABLE invoices DISABLE TRIGGER invoices_no_update`);
      await tx
        .update(invoices)
        .set({ status: "ملغي" })
        .where(eq(invoices.id, base.invoiceId));
      await tx.execute(sql`ALTER TABLE invoices ENABLE TRIGGER invoices_no_update`);
    });

    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "should fail",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "cnl-a",
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVOICE_NOT_ISSUABLE_AVOIR");

    // Restore so follow-on tests aren't poisoned (revert status back).
    await withTxInRoute(undefined, async (tx) => {
      await tx.execute(sql`ALTER TABLE invoices DISABLE TRIGGER invoices_no_update`);
      await tx
        .update(invoices)
        .set({ status: "مؤكد" })
        .where(eq(invoices.id, base.invoiceId));
      await tx.execute(sql`ALTER TABLE invoices ENABLE TRIGGER invoices_no_update`);
    });
  });

  it("T-AV-NEG-AVOIR-ON-AVOIR: avoir of an avoir → 409 AVOIR_ON_AVOIR_NOT_ALLOWED", async () => {
    const base = await createConfirmedInvoice(1, "aa-a");
    const r1 = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "first avoir",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "aa-a-1",
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { avoir: { id: number } };

    // Fetch the avoir's own line ids to pass a semantically-valid body.
    const { withRead } = await import("@/db/client");
    const { invoiceLines } = await import("@/db/schema");
    const avoirLines = await withRead(undefined, (db) =>
      db
        .select({ id: invoiceLines.id })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, b1.avoir.id)),
    );

    const r2 = await callIssueAvoir(
      b1.avoir.id,
      admin(),
      {
        reason: "avoir of avoir",
        lines: avoirLines.map((l) => ({
          invoiceLineId: l.id,
          quantityToCredit: 1,
        })),
      },
      "aa-a-2",
    );
    expect(r2.status).toBe(409);
    const body = (await r2.json()) as { code: string };
    expect(body.code).toBe("AVOIR_ON_AVOIR_NOT_ALLOWED");
  });

  it("T-AV-NEG-LINE-NOT-IN-INVOICE: invoiceLineId from another invoice → 400 INVALID_AVOIR_LINE_SET", async () => {
    const a = await createConfirmedInvoice(1, "lni-a");
    const b = await createConfirmedInvoice(1, "lni-b");
    const res = await callIssueAvoir(
      a.invoiceId,
      admin(),
      {
        reason: "cross-invoice",
        lines: [{ invoiceLineId: b.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "lni",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_AVOIR_LINE_SET");
  });

  it("T-AV-NEG-LINE-DUPLICATE: same invoiceLineId twice → 400 INVALID_AVOIR_LINE_SET", async () => {
    const base = await createConfirmedInvoice(1, "dup-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "dup",
        lines: [
          { invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.25 },
          { invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.25 },
        ],
      },
      "dup",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_AVOIR_LINE_SET");
  });

  it("T-AV-NEG-QTY-EXCEEDS: qty 1.1 on a line qty=1 → 409 AVOIR_QTY_EXCEEDS_REMAINING", async () => {
    const base = await createConfirmedInvoice(1, "qex-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "over",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1.1 }],
      },
      "qex",
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("AVOIR_QTY_EXCEEDS_REMAINING");
  });

  it("T-AV-NEG-QTY-EXCEEDS-SEQUENTIAL: first 0.7, second 0.4 → second 409", async () => {
    const base = await createConfirmedInvoice(1, "qex2-a");
    const r1 = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "seq1",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.7 }],
      },
      "qex2-1",
    );
    expect(r1.status).toBe(200);
    const r2 = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "seq2",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.4 }],
      },
      "qex2-2",
    );
    expect(r2.status).toBe(409);
    const body = (await r2.json()) as { code: string };
    expect(body.code).toBe("AVOIR_QTY_EXCEEDS_REMAINING");
  });

  it("T-AV-NEG-REASON-EMPTY: reason='' → 400 VALIDATION_FAILED", async () => {
    const base = await createConfirmedInvoice(1, "re-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "re",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("T-AV-NEG-QTY-SUBCENT: quantityToCredit=0.004 → 400 VALIDATION_FAILED", async () => {
    const base = await createConfirmedInvoice(1, "qsc-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "sub cent",
        lines: [
          { invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.004 },
        ],
      },
      "qsc",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("T-AV-NEG-EMPTY-LINES: lines=[] → 400 VALIDATION_FAILED", async () => {
    const base = await createConfirmedInvoice(1, "em-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      { reason: "empty", lines: [] },
      "em",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("T-AV-NEG-D35: remove shop_siret setting → 412 D35_READINESS_INCOMPLETE, zero avoir inserted", async () => {
    const base = await createConfirmedInvoice(1, "d35-a");
    const { withTxInRoute, withRead } = await import("@/db/client");
    const { settings, invoices } = await import("@/db/schema");
    // Soft-override: set siret to placeholder (d35 treats as missing).
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(settings)
        .set({ value: "TO_FILL" })
        .where(eq(settings.key, "shop_siret"));
    });

    const before = await withRead(undefined, (db) =>
      db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.avoirOfId, base.invoiceId)),
    );
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "missing d35",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "d35",
    );
    expect(res.status).toBe(412);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("D35_READINESS_INCOMPLETE");
    const after = await withRead(undefined, (db) =>
      db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.avoirOfId, base.invoiceId)),
    );
    expect(after.length).toBe(before.length);

    // Restore so follow-on tests aren't poisoned.
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(settings)
        .set({ value: "12345678901234" })
        .where(eq(settings.key, "shop_siret"));
    });
  });

  // ─────────────────── PERMISSIONS ───────────────────

  it("T-AV-PERM: manager/seller/driver/stock_keeper → 403; pm/gm → 200", async () => {
    const base = await createConfirmedInvoice(1, "perm-a");
    const bodyTemplate = (tag: string) => ({
      reason: `perm ${tag}`,
      lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 0.1 }],
    });
    for (const who of [manager(), seller(), driver(), sk()]) {
      const r = await callIssueAvoir(
        base.invoiceId,
        who,
        bodyTemplate(who.role),
        `perm-${who.role}`,
      );
      expect(r.status).toBe(403);
    }
    // gm allowed (pm is allowed for happy path covered elsewhere).
    const rGm = await callIssueAvoir(
      base.invoiceId,
      gm(),
      bodyTemplate("gm"),
      "perm-gm",
    );
    expect(rGm.status).toBe(200);
  });

  // ─────────────────── IDEMPOTENCY ───────────────────

  it("T-AV-IDEM: replay same key → identical response, exactly 1 avoir row", async () => {
    const base = await createConfirmedInvoice(1, "idem-a");
    const body = {
      reason: "idempotent",
      lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
    };
    const r1 = await callIssueAvoir(base.invoiceId, admin(), body, "idem-a");
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { avoir: { id: number } };
    const r2 = await callIssueAvoir(base.invoiceId, admin(), body, "idem-a");
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { avoir: { id: number } };
    expect(b2.avoir.id).toBe(b1.avoir.id);

    const { withRead } = await import("@/db/client");
    const { invoices } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(eq(invoices.avoirOfId, base.invoiceId), isNull(invoices.deletedAt)),
        ),
    );
    expect(rows.length).toBe(1);
  });

  // ─────────────────── CONCURRENCY ───────────────────

  it("T-AV-CONC: two parallel full-reverses of the same invoice → 1 succeeds, 1 fails AVOIR_QTY_EXCEEDS_REMAINING", async () => {
    const base = await createConfirmedInvoice(1, "cnc-a");
    const body = {
      reason: "concurrent",
      lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
    };
    const [r1, r2] = await Promise.all([
      callIssueAvoir(base.invoiceId, admin(), body, "cnc-a-1"),
      callIssueAvoir(base.invoiceId, admin(), body, "cnc-a-2"),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    const loserBody = (await loser.json()) as { code: string };
    expect(loserBody.code).toBe("AVOIR_QTY_EXCEEDS_REMAINING");
  });

  // ─────────────────── CHAIN + D-58 ───────────────────

  it("T-AV-CHAIN: invoice + invoice_lines chains verify end-to-end after avoir issue", async () => {
    const base = await createConfirmedInvoice(2, "ch-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "chain check",
        lines: base.invoiceLineIds.map((id) => ({
          invoiceLineId: id,
          quantityToCredit: 1,
        })),
      },
      "ch",
    );
    expect(res.status).toBe(200);
    const { withTxInRoute } = await import("@/db/client");
    const { verifyInvoicesChain, verifyInvoiceLinesChain } = await import(
      "@/modules/invoices/chain"
    );
    await withTxInRoute(undefined, async (tx) => {
      // Both verifiers return `null` when the chain is intact or the id of
      // the first mismatched row. A healthy chain → null.
      const firstBadInvoice = await verifyInvoicesChain(tx);
      expect(firstBadInvoice).toBeNull();
      const firstBadLine = await verifyInvoiceLinesChain(tx);
      expect(firstBadLine).toBeNull();
    });
  });

  it("T-AV-D58: UPDATE on an avoir row is rejected by invoices_no_update trigger", async () => {
    const base = await createConfirmedInvoice(1, "d58-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "d58 check",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "d58",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { avoir: { id: number } };

    const { withTxInRoute } = await import("@/db/client");
    const { invoices } = await import("@/db/schema");
    await expect(
      withTxInRoute(undefined, async (tx) => {
        await tx
          .update(invoices)
          .set({ status: "ملغي" })
          .where(eq(invoices.id, body.avoir.id));
      }),
    ).rejects.toThrow();
  });

  // ─────────────────── PDF ───────────────────

  it("T-AV-PDF: GET /invoices/[avoirId]/pdf → 200 + Content-Type application/pdf + non-empty body", async () => {
    const base = await createConfirmedInvoice(1, "pdf-a");
    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "pdf smoke",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "pdf",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { avoir: { id: number } };

    const r = await freshRoutes(admin());
    const pdfRes = await r.invoicesPdf.GET(
      new Request(
        `http://localhost/api/v1/invoices/${body.avoir.id}/pdf`,
      ),
      { params: Promise.resolve({ id: String(body.avoir.id) }) },
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type") ?? "").toMatch(/application\/pdf/);
    const buf = await pdfRes.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(500);
    // Note: the exact "AVOIR" + parentRefCode rendering is verified unit-level
    // in src/modules/invoices/pdf-header.test.ts — deterministic proof path
    // without pdf-text extraction.
  });

  // ─────────────────── POST-REVIEW FIXES ───────────────────

  it("T-AV-GIFT-ONLY: selecting only gift lines (line_total=0) → 400 INVALID_AVOIR_LINE_SET", async () => {
    // Mixed order: one paid line + one gift line. Each gift line has
    // unit_price=0 in orders.dto, which pricing.ts turns into
    // line_total=0 on the frozen invoice_line. Selecting ONLY the gift
    // line for refund yields a zero-totalTtc avoir — the service guard
    // rejects with 400 (NOT 500 — this is caller input, not a server bug).
    //
    // orders.service enforces gift_pool membership for any isGift item.
    // Seed a generous gift_pool entry first so the order POST succeeds.
    const { withTxInRoute } = await import("@/db/client");
    const { giftPool } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx.insert(giftPool).values({
        productId,
        quantity: "100.00",
        createdBy: "admin",
      });
    });

    const base = await createConfirmedInvoice(
      [
        { productId, quantity: 1, unitPrice: 100 },
        { productId, quantity: 1, unitPrice: 0, isGift: true },
      ],
      "gift-only",
    );
    expect(base.invoiceLineIds.length).toBe(2);

    // Resolve which invoice line is the gift (line_total=0).
    const { withRead } = await import("@/db/client");
    const { invoiceLines } = await import("@/db/schema");
    const lineRows = await withRead(undefined, (db) =>
      db
        .select({
          id: invoiceLines.id,
          lineTotalTtcFrozen: invoiceLines.lineTotalTtcFrozen,
          isGift: invoiceLines.isGift,
        })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, base.invoiceId)),
    );
    const giftLine = lineRows.find(
      (l) => l.isGift === true || Number(l.lineTotalTtcFrozen) === 0,
    );
    expect(giftLine).toBeDefined();

    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "gift-only selection",
        lines: [{ invoiceLineId: giftLine!.id, quantityToCredit: 1 }],
      },
      "gift-only",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_AVOIR_LINE_SET");
  });

  it("T-AV-CROSS-MONTH: backdated parent (2026-03-15) → avoir.date=TODAY (not parent.date)", async () => {
    const base = await createConfirmedInvoice(1, "xm-a");

    // Backdate the parent to 2026-03-15. D-58 blocks UPDATE, so we disable
    // the trigger for the duration of the backdating (pattern reused from
    // T-AV-NEG-CANCELLED-PARENT), then re-enable.
    const { withTxInRoute, withRead } = await import("@/db/client");
    const { invoices } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    await withTxInRoute(undefined, async (tx) => {
      await tx.execute(sql`ALTER TABLE invoices DISABLE TRIGGER invoices_no_update`);
      await tx
        .update(invoices)
        .set({ date: "2026-03-15" })
        .where(eq(invoices.id, base.invoiceId));
      await tx.execute(sql`ALTER TABLE invoices ENABLE TRIGGER invoices_no_update`);
    });

    const res = await callIssueAvoir(
      base.invoiceId,
      admin(),
      {
        reason: "cross-month reversal",
        lines: [{ invoiceLineId: base.invoiceLineIds[0], quantityToCredit: 1 }],
      },
      "xm",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      avoir: { id: number; date: string; refCode: string };
      parentRefCode: string;
    };

    // Avoir's own `date` field must differ from the (now backdated) parent.
    expect(body.avoir.date).not.toBe("2026-03-15");

    // Avoir's `date` must match "today" in Paris — the day of issuance.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(body.avoir.date).toBe(today);

    // Ref-code month must align with the avoir's own date, not the parent's.
    // Format is FAC-YYYY-MM-NNNN.
    const [, avoirYear, avoirMonth] = body.avoir.refCode.split("-");
    const [todayYear, todayMonth] = today.split("-");
    expect(avoirYear).toBe(todayYear);
    expect(avoirMonth).toBe(todayMonth);

    // Double-check: the DB row persisted the issuance date (not parent date).
    const persisted = await withRead(undefined, (db) =>
      db
        .select({ date: invoices.date, refCode: invoices.refCode })
        .from(invoices)
        .where(eq(invoices.id, body.avoir.id))
        .limit(1),
    );
    expect(persisted[0].date).toBe(today);
    expect(persisted[0].date).not.toBe("2026-03-15");
  });

  // Touches `freshRoutes` to silence "declared but unused" when iterating.
  void freshRoutes;
});
