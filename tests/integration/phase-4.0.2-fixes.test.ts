import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.0.2 — accounting-date correctness for confirm-delivery.
//
// Reviewer finding: Phase 4.0 + 4.0.1 were stamping payments.date + bonuses.date
// with the DELIVERY row's date (which was copied from orders.date at delivery
// creation). That collapses the accounting period onto the order date, not the
// confirm date — breaking 00_DECISIONS §treasury + 10_Calculation_Formulas
// §bonuses + BR-31 (commission computed at the moment of confirm).
//
// This suite exercises the exact cross-day scenario: order dated in the past,
// delivered "today", and asserts all 4 period-sensitive date columns pin to
// the confirm-moment Paris date.

function todayParisIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

describe.skipIf(!HAS_DB)("Phase 4.0.2 — confirm-date accounting invariants (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let driverId: number;
  let clientId: number;
  let productId: number;

  const PAST_ORDER_DATE = "2026-01-10"; // must NOT equal todayParisIso()

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

    const hash = await hashPassword("test-pass-4.0.2");
    [sellerId, driverId] = await withTxInRoute(undefined, async (tx) => {
      const seller = await tx
        .insert(users)
        .values({
          username: "sel-42",
          password: hash,
          name: "Seller 42",
          role: "seller",
          active: true,
        })
        .returning();
      const wired = await wireManagerAndDrivers(tx, {
        managerSuffix: "402",
        driverSuffixes: ["42"],
        passwordHash: hash,
      });
      return [seller[0].id, wired.driverIds[0]];
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 4.0.2", phone: "+33600420001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "منتج 4.0.2",
          category: "cat-42",
          buyPrice: "40.00",
          sellPrice: "100.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      const upserts = [
        { key: "max_discount_seller_pct", value: "5" },
        { key: "seller_bonus_fixed", value: "0" },
        { key: "seller_bonus_percentage", value: "0" },
        { key: "driver_bonus_fixed", value: "0" },
        ...D35_SEED_SETTINGS,
      ];
      for (const s of upserts) {
        await tx
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
      }
      await tx
        .insert(productCommissionRules)
        .values({
          category: "cat-42",
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
      startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
      deliveries: await import("@/app/api/v1/deliveries/route"),
      deliveriesStart: await import("@/app/api/v1/deliveries/[id]/start/route"),
      deliveriesConfirm: await import(
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route"
      ),
    };
  }

  const adminClaims = () => ({ id: adminUserId, username: "admin", role: "pm", name: "A" });
  const sellerClaims = () => ({ id: sellerId, username: "sel-42", role: "seller", name: "S" });
  const driverClaims = () => ({ id: driverId, username: "drv-42", role: "driver", name: "D" });

  it("cross-day: order dated in the past but confirmed today → payments.date + bonuses.date + orders.delivery_date all = today (Paris)", async () => {
    // Confirm the precondition the test relies on: the seeded order date is
    // NOT today — otherwise the assertion below is trivially satisfied.
    const today = todayParisIso();
    expect(PAST_ORDER_DATE).not.toBe(today);

    // 1. Create order with an explicit past date.
    const rc = await freshRoutes(sellerClaims());
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: PAST_ORDER_DATE,
          items: [{ productId, quantity: 1, unitPrice: 100 }],
        }),
      }),
    );
    expect(create.status).toBe(201);
    const { order } = (await create.json()) as { order: { id: number } };

    // 2. Move to 'جاهز' (admin).
    const rsp = await freshRoutes(adminClaims());
    const spRes = await rsp.startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `42-sp-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(spRes.status).toBe(200);
    const rmr = await freshRoutes(adminClaims());
    const mrRes = await rmr.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `42-mr-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(mrRes.status).toBe(200);

    // 3. Create delivery assigned to driver. Delivery's own date column is
    // expected to still mirror orders.date (this test is NOT changing that —
    // delivery routing is an operations date, not an accounting date).
    const rcd = await freshRoutes(adminClaims());
    const cdRes = await rcd.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, assignedDriverId: driverId }),
      }),
    );
    expect(cdRes.status).toBe(201);
    const { delivery } = (await cdRes.json()) as { delivery: { id: number } };

    // 4. Start delivery (driver self).
    const rs = await freshRoutes(driverClaims());
    const startRes = await rs.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `42-start-${delivery.id}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(startRes.status).toBe(200);

    // 5. Confirm-delivery — cash, full payment. This is where all the
    //    accounting dates get written.
    const rc2 = await freshRoutes(driverClaims());
    const confirmRes = await rc2.deliveriesConfirm.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `42-confirm-${delivery.id}`,
        },
        body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(confirmRes.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { bonuses, orders, payments } = await import("@/db/schema");

    // orders.delivery_date + confirmation_date pinned to today (D-35 + Phase 4.0.2).
    const orderRow = (
      await withRead(undefined, (db) =>
        db.select().from(orders).where(eq(orders.id, order.id)).limit(1),
      )
    )[0];
    expect(orderRow.status).toBe("مؤكد");
    expect(orderRow.deliveryDate).toBe(today);
    expect(orderRow.confirmationDate).not.toBeNull();
    // Order's original (submitted) date untouched.
    expect(orderRow.date).toBe(PAST_ORDER_DATE);

    // payments.date pinned to today (00_DECISIONS §treasury period key).
    const payRows = await withRead(undefined, (db) =>
      db.select().from(payments).where(eq(payments.orderId, order.id)),
    );
    expect(payRows.length).toBe(1);
    expect(payRows[0].date).toBe(today);
    expect(payRows[0].date).not.toBe(PAST_ORDER_DATE);

    // bonuses.date pinned to today (BR-31 + 10_Calculation_Formulas period key).
    const bonusRows = await withRead(undefined, (db) =>
      db
        .select()
        .from(bonuses)
        .where(and(eq(bonuses.orderId, order.id), isNull(bonuses.deletedAt))),
    );
    expect(bonusRows.length).toBeGreaterThanOrEqual(2); // seller + driver
    for (const b of bonusRows) {
      expect(b.date).toBe(today);
      expect(b.date).not.toBe(PAST_ORDER_DATE);
    }
  });
});
