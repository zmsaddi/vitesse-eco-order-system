import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.1.1 — corrective tranche for Phase 4.1.
//
// Reviewer findings covered verbatim:
//   1. D-35 required keys extended to match the canonical spec; a single
//      test corrupts FOUR keys simultaneously and asserts all four appear
//      in the rejection payload.
//   2. Vendor legal data is frozen on the invoice row at issue time; the
//      PDF endpoint reads only from the invoice, never from live settings.
//      A test mutates shop_name + shop_iban + shop_penalty_rate_annual in
//      settings AFTER issue and asserts the invoice still returns the
//      original values via JSON AND the PDF still renders successfully
//      (route never touches settings).
//   3. `invoices.payments_history` captures the order's payment rows at
//      issue time. Happy-path test asserts the single collection row
//      lands in the snapshot; credit-partial test asserts an empty
//      snapshot when no payments exist yet.

describe.skipIf(!HAS_DB)("Phase 4.1.1 fixes (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let driverId: number;
  let clientId: number;
  let productId: number;

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

    const hash = await hashPassword("test-pass-4.1.1");
    [sellerId, driverId] = await withTxInRoute(undefined, async (tx) => {
      const s = await tx
        .insert(users)
        .values({ username: "sel-411", password: hash, name: "Seller 411", role: "seller", active: true })
        .returning();
      const wired = await wireManagerAndDrivers(tx, {
        managerSuffix: "p411",
        driverSuffixes: ["411"],
        passwordHash: hash,
      });
      return [s[0].id, wired.driverIds[0]];
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({
            name: "Société 411",
            phone: "+33600411001",
            email: "c411@example.fr",
            address: "1 Rue 411",
            createdBy: "admin",
          })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "Produit 411",
          category: "cat-411",
          buyPrice: "40.00",
          sellPrice: "100.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
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
          category: "cat-411",
          sellerFixedPerUnit: "5",
          sellerPctOverage: "10",
          driverFixedPerDelivery: "8",
          active: true,
        })
        .onConflictDoNothing({ target: productCommissionRules.category });
      return p[0].id;
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
      invoicesDetail: await import("@/app/api/v1/invoices/[id]/route"),
      invoicesPdf: await import("@/app/api/v1/invoices/[id]/pdf/route"),
    };
  }

  const admin = () => ({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
  const seller = () => ({ id: sellerId, username: "sel-411", role: "seller", name: "Seller" });
  const driver = () => ({ id: driverId, username: "drv-411", role: "driver", name: "Driver" });

  async function runToReady(idem: string): Promise<number> {
    const rc = await freshRoutes(seller());
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId, quantity: 1, unitPrice: 100 }],
        }),
      }),
    );
    expect(create.status).toBe(201);
    const { order } = (await create.json()) as { order: { id: number } };

    const rsp = await freshRoutes(admin());
    await rsp.startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `411-sp-${order.id}-${idem}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    const rmr = await freshRoutes(admin());
    await rmr.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `411-mr-${order.id}-${idem}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    return order.id;
  }

  async function runToStarted(idem: string): Promise<{ orderId: number; deliveryId: number }> {
    const orderId = await runToReady(idem);
    const rcd = await freshRoutes(admin());
    const cd = await rcd.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await cd.json()) as { delivery: { id: number } };
    const rs = await freshRoutes(driver());
    await rs.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `411-start-${delivery.id}-${idem}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    return { orderId, deliveryId: delivery.id };
  }

  async function confirmWith(
    deliveryId: number,
    paidAmount: number,
    paymentMethod: string,
    idem: string,
  ): Promise<Response> {
    const r = await freshRoutes(driver());
    return r.deliveriesConfirm.POST(
      new Request(`http://localhost/api/v1/deliveries/${deliveryId}/confirm-delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `411-confirm-${deliveryId}-${idem}`,
        },
        body: JSON.stringify({ paidAmount, paymentMethod }),
      }),
      { params: Promise.resolve({ id: String(deliveryId) }) },
    );
  }

  // ──────────────── Fix 1: D-35 multi-key ────────────────

  it("D-35 gate rejects when multiple canonical keys are missing/placeholder (4-key scenario)", async () => {
    const { deliveryId } = await runToStarted("d35-multi");

    const { withTxInRoute } = await import("@/db/client");
    const { settings } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(settings)
        .set({ value: "TO_FILL" })
        .where(eq(settings.key, "shop_siren"));
      await tx
        .update(settings)
        .set({ value: "TO_FILL" })
        .where(eq(settings.key, "shop_ape"));
      await tx
        .update(settings)
        .set({ value: "TO_FILL" })
        .where(eq(settings.key, "shop_penalty_rate_annual"));
      await tx
        .update(settings)
        .set({ value: "" })
        .where(eq(settings.key, "shop_recovery_fee_eur"));
    });

    try {
      const res = await confirmWith(deliveryId, 100, "كاش", "d35-multi");
      expect(res.status).toBe(412);
      const body = (await res.json()) as {
        code: string;
        details?: { missing?: string[] };
      };
      expect(body.code).toBe("D35_READINESS_INCOMPLETE");
      // apiError wraps BusinessRuleError.extra under `details`.
      const missing = body.details?.missing ?? [];
      // All four corrupted keys must appear in the rejection payload — not
      // just the first one found.
      expect(missing).toContain("shop_siren");
      expect(missing).toContain("shop_ape");
      expect(missing).toContain("shop_penalty_rate_annual");
      expect(missing).toContain("shop_recovery_fee_eur");
    } finally {
      // Restore unconditionally so subsequent tests run against good D-35
      // settings even when an assertion above throws.
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(settings)
          .set({ value: "123456789" })
          .where(eq(settings.key, "shop_siren"));
        await tx
          .update(settings)
          .set({ value: "4618Z" })
          .where(eq(settings.key, "shop_ape"));
        await tx
          .update(settings)
          .set({ value: "10.5" })
          .where(eq(settings.key, "shop_penalty_rate_annual"));
        await tx
          .update(settings)
          .set({ value: "40" })
          .where(eq(settings.key, "shop_recovery_fee_eur"));
      });
    }
  });

  // ──────────────── Fix 2: vendor data frozen on invoice row ────────────────

  it("vendor snapshot frozen: mutating settings after issue does not change the invoice OR the PDF render path", async () => {
    const { deliveryId } = await runToStarted("vendor-freeze");
    const confirmRes = await confirmWith(deliveryId, 100, "كاش", "vendor-freeze");
    expect(confirmRes.status).toBe(200);
    const { invoiceId } = (await confirmRes.json()) as { invoiceId: number };

    // Capture the vendor snapshot BEFORE mutation.
    const rBefore = await freshRoutes(admin());
    const beforeRes = await rBefore.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    const before = (await beforeRes.json()) as {
      invoice: {
        vendorSnapshot: {
          shopName: string;
          shopIban: string;
          shopPenaltyRateAnnual: string;
        };
      };
    };
    expect(before.invoice.vendorSnapshot.shopName).toBe("VITESSE ECO SAS");
    expect(before.invoice.vendorSnapshot.shopIban).toBe(
      "FR7610057190010000000000001",
    );
    expect(before.invoice.vendorSnapshot.shopPenaltyRateAnnual).toBe("10.5");

    // Mutate live settings — shop_name, IBAN, and penalty rate. Done outside
    // the invoice's tx; if the vendor block weren't actually frozen these
    // would leak into the JSON detail and the PDF.
    const { withTxInRoute } = await import("@/db/client");
    const { settings } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(settings)
        .set({ value: "HACKED NAME" })
        .where(eq(settings.key, "shop_name"));
      await tx
        .update(settings)
        .set({ value: "FR0000000000000000000000000" })
        .where(eq(settings.key, "shop_iban"));
      await tx
        .update(settings)
        .set({ value: "99.9" })
        .where(eq(settings.key, "shop_penalty_rate_annual"));
    });

    try {
      // Fetch again — vendorSnapshot still carries the original values.
      const rAfter = await freshRoutes(admin());
      const afterRes = await rAfter.invoicesDetail.GET(
        new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
        { params: Promise.resolve({ id: String(invoiceId) }) },
      );
      const after = (await afterRes.json()) as {
        invoice: {
          vendorSnapshot: {
            shopName: string;
            shopIban: string;
            shopPenaltyRateAnnual: string;
          };
        };
      };
      expect(after.invoice.vendorSnapshot.shopName).toBe("VITESSE ECO SAS");
      expect(after.invoice.vendorSnapshot.shopIban).toBe(
        "FR7610057190010000000000001",
      );
      expect(after.invoice.vendorSnapshot.shopPenaltyRateAnnual).toBe("10.5");

      // The PDF endpoint must still render successfully — it has no live
      // settings read, so the HACKED values cannot affect rendering at all.
      const rPdf = await freshRoutes(admin());
      const pdfRes = await rPdf.invoicesPdf.GET(
        new Request(`http://localhost/api/v1/invoices/${invoiceId}/pdf`),
        { params: Promise.resolve({ id: String(invoiceId) }) },
      );
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers.get("content-type")).toContain("application/pdf");
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    } finally {
      // Restore settings so later tests / suites aren't polluted.
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(settings)
          .set({ value: "VITESSE ECO SAS" })
          .where(eq(settings.key, "shop_name"));
        await tx
          .update(settings)
          .set({ value: "FR7610057190010000000000001" })
          .where(eq(settings.key, "shop_iban"));
        await tx
          .update(settings)
          .set({ value: "10.5" })
          .where(eq(settings.key, "shop_penalty_rate_annual"));
      });
    }
  });

  // ──────────────── Fix 3: payments_history on invoice ────────────────

  it("payments_history: confirm-delivery with paidAmount=100 → 1 frozen payment row on invoice", async () => {
    const { deliveryId } = await runToStarted("pay-hist");
    const confirmRes = await confirmWith(deliveryId, 100, "كاش", "pay-hist");
    expect(confirmRes.status).toBe(200);
    const { invoiceId } = (await confirmRes.json()) as { invoiceId: number };

    const rDetail = await freshRoutes(admin());
    const detailRes = await rDetail.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    const detail = (await detailRes.json()) as {
      invoice: {
        paymentsHistory: Array<{
          date: string;
          amount: string;
          paymentMethod: string;
          type: string;
        }>;
      };
    };
    expect(detail.invoice.paymentsHistory.length).toBe(1);
    const p = detail.invoice.paymentsHistory[0];
    expect(p.paymentMethod).toBe("كاش");
    expect(p.type).toBe("collection");
    expect(Number(p.amount)).toBe(100);
    // Date must match today's Paris ISO (same as orders.delivery_date per
    // Phase 4.0.2).
    expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Subsequently mutating the live `payments` row must not change the
    // frozen snapshot on the invoice.
    const detailFull = (await (await freshRoutes(admin())).invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    ).then((r) => r.json())) as { invoice: { orderId: number } };
    const orderIdForInvoice = detailFull.invoice.orderId;

    const { withTxInRoute } = await import("@/db/client");
    const { payments } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(payments)
        .set({ amount: "1.00" })
        .where(eq(payments.orderId, orderIdForInvoice));
    });

    const rReload = await freshRoutes(admin());
    const reloadRes = await rReload.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    const reload = (await reloadRes.json()) as {
      invoice: {
        paymentsHistory: Array<{ amount: string }>;
      };
    };
    expect(Number(reload.invoice.paymentsHistory[0].amount)).toBe(100);
  });

  it("payments_history: credit (آجل) with paidAmount=0 → empty frozen array, PDF still renders", async () => {
    const { deliveryId } = await runToStarted("credit-zero");
    const confirmRes = await confirmWith(deliveryId, 0, "آجل", "credit-zero");
    expect(confirmRes.status).toBe(200);
    const { invoiceId } = (await confirmRes.json()) as { invoiceId: number };

    const rDetail = await freshRoutes(admin());
    const detailRes = await rDetail.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    const detail = (await detailRes.json()) as {
      invoice: { paymentsHistory: unknown[] };
    };
    expect(detail.invoice.paymentsHistory.length).toBe(0);

    // PDF endpoint still renders (no payments block).
    const rPdf = await freshRoutes(admin());
    const pdfRes = await rPdf.invoicesPdf.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}/pdf`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    expect(pdfRes.status).toBe(200);
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
