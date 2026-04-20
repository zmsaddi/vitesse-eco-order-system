import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 4.0.1 — corrective tranche for the 4 issues flagged on Phase 4.0:
//   1. BR-23: start/confirm-delivery now support null-driver self-assign.
//   2. BR-07/BR-09: cash/bank must be paid in full at delivery; no overpay.
//   3. D-35: confirm-delivery populates orders.delivery_date + confirmation_date.
//   4. BR-18: cancelOrder applies the captured bonus-action tuple on confirmed
//      orders (keep → retained, cancel_unpaid → soft-delete, cancel_as_debt →
//      deferred until settlements ship).

describe.skipIf(!HAS_DB)("Phase 4.0.1 corrective fixes (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let driverId: number;
  let driver2Id: number;
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

    const hash = await hashPassword("test-pass-4.0.1");
    [sellerId, driverId, driver2Id] = await withTxInRoute(undefined, async (tx) => {
      const seller = await tx
        .insert(users)
        .values({
          username: "sel-41",
          password: hash,
          name: "Seller 41",
          role: "seller",
          active: true,
        })
        .returning();
      const driver = await tx
        .insert(users)
        .values({
          username: "drv-41a",
          password: hash,
          name: "Driver 41A",
          role: "driver",
          active: true,
        })
        .returning();
      const driver2 = await tx
        .insert(users)
        .values({
          username: "drv-41b",
          password: hash,
          name: "Driver 41B",
          role: "driver",
          active: true,
        })
        .returning();
      return [seller[0].id, driver[0].id, driver2[0].id];
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 4.0.1", phone: "+33600410001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "منتج 4.0.1",
          category: "cat-41",
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
          category: "cat-41",
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
      ordersCancel: await import("@/app/api/v1/orders/[id]/cancel/route"),
      startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
      deliveries: await import("@/app/api/v1/deliveries/route"),
      deliveriesStart: await import("@/app/api/v1/deliveries/[id]/start/route"),
      deliveriesConfirm: await import(
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route"
      ),
    };
  }

  const adminClaims = () => ({
    id: adminUserId,
    username: "admin",
    role: "pm",
    name: "Admin",
  });
  const driverClaims = () => ({
    id: driverId,
    username: "drv-41a",
    role: "driver",
    name: "Driver A",
  });
  const driver2Claims = () => ({
    id: driver2Id,
    username: "drv-41b",
    role: "driver",
    name: "Driver B",
  });
  const sellerClaims = () => ({
    id: sellerId,
    username: "sel-41",
    role: "seller",
    name: "Seller",
  });

  async function createReadyOrder(
    creator: { id: number; username: string; role: string; name: string },
    items: Array<{ productId: number; quantity: number; unitPrice: number }>,
  ): Promise<{ orderId: number }> {
    const rc = await freshRoutes(creator);
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, date: "2026-04-20", items }),
      }),
    );
    expect(create.status).toBe(201);
    const { order } = (await create.json()) as { order: { id: number } };
    const rsp = await freshRoutes(adminClaims());
    const spRes = await rsp.startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `41-sp-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(spRes.status).toBe(200);
    const rmr = await freshRoutes(adminClaims());
    const mrRes = await rmr.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `41-mr-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(mrRes.status).toBe(200);
    return { orderId: order.id };
  }

  async function createDelivery(
    orderId: number,
    opts: { assignedDriverId: number | null },
  ): Promise<{ deliveryId: number }> {
    const r = await freshRoutes(adminClaims());
    const res = await r.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: opts.assignedDriverId }),
      }),
    );
    expect(res.status).toBe(201);
    const { delivery } = (await res.json()) as { delivery: { id: number } };
    return { deliveryId: delivery.id };
  }

  async function startDelivery(
    deliveryId: number,
    claims: { id: number; username: string; role: string; name: string },
    idemSuffix: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${deliveryId}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `41-start-${deliveryId}-${idemSuffix}` },
      }),
      { params: Promise.resolve({ id: String(deliveryId) }) },
    );
  }

  async function confirmDelivery(
    deliveryId: number,
    claims: { id: number; username: string; role: string; name: string },
    body: { paidAmount: number; paymentMethod?: string; notes?: string },
    idemSuffix: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${deliveryId}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `41-confirm-${deliveryId}-${idemSuffix}`,
          },
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ id: String(deliveryId) }) },
    );
  }

  // ────────────── Fix 1 — BR-23 ──────────────

  it("BR-23: driver self-starts a null-driver delivery → self-assigned + task spawned", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: null });

    const res = await startDelivery(deliveryId, driverClaims(), "br23a");
    expect(res.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { deliveries, driverTasks } = await import("@/db/schema");
    const drv = await withRead(undefined, (db) =>
      db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1),
    );
    expect(drv[0].assignedDriverId).toBe(driverId);
    expect(drv[0].status).toBe("جاري التوصيل");

    const tasks = await withRead(undefined, (db) =>
      db
        .select()
        .from(driverTasks)
        .where(
          and(
            eq(driverTasks.relatedEntityType, "delivery"),
            eq(driverTasks.relatedEntityId, deliveryId),
          ),
        ),
    );
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignedDriverId).toBe(driverId);
    expect(tasks[0].status).toBe("in_progress");
  });

  it("BR-23: admin cannot start a null-driver delivery → 400 NO_DRIVER_ASSIGNED", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: null });
    const res = await startDelivery(deliveryId, adminClaims(), "br23b");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NO_DRIVER_ASSIGNED");
  });

  it("BR-23: after driver self-starts, a different driver cannot confirm (403)", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: null });
    await startDelivery(deliveryId, driverClaims(), "br23c");
    const res = await confirmDelivery(
      deliveryId,
      driver2Claims(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "br23c",
    );
    expect(res.status).toBe(403);
  });

  // ────────────── Fix 2 — BR-07/BR-09 ──────────────

  it("BR-09: overpayment (paid > remaining) → 400 OVERPAYMENT", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: driverId });
    await startDelivery(deliveryId, driverClaims(), "br09-over");
    const res = await confirmDelivery(
      deliveryId,
      driverClaims(),
      { paidAmount: 150, paymentMethod: "كاش" },
      "br09-over",
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("OVERPAYMENT");
  });

  it("BR-07: cash short-pay → 400 INCOMPLETE_CASH_PAYMENT", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: driverId });
    await startDelivery(deliveryId, driverClaims(), "br07-cash");
    const res = await confirmDelivery(
      deliveryId,
      driverClaims(),
      { paidAmount: 50, paymentMethod: "كاش" },
      "br07-cash",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INCOMPLETE_CASH_PAYMENT");
  });

  it("BR-07: bank short-pay → 400 INCOMPLETE_CASH_PAYMENT", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: driverId });
    await startDelivery(deliveryId, driverClaims(), "br07-bank");
    const res = await confirmDelivery(
      deliveryId,
      driverClaims(),
      { paidAmount: 50, paymentMethod: "بنك" },
      "br07-bank",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INCOMPLETE_CASH_PAYMENT");
  });

  it("BR-07: credit (آجل) partial allowed — paidAmount=0 succeeds", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: driverId });
    await startDelivery(deliveryId, driverClaims(), "br07-credit");
    const res = await confirmDelivery(
      deliveryId,
      driverClaims(),
      { paidAmount: 0, paymentMethod: "آجل" },
      "br07-credit",
    );
    expect(res.status).toBe(200);
  });

  // ────────────── Fix 3 — D-35 ──────────────

  it("D-35: confirm-delivery populates orders.delivery_date + confirmation_date", async () => {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: driverId });
    await startDelivery(deliveryId, driverClaims(), "d35");
    const res = await confirmDelivery(
      deliveryId,
      driverClaims(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "d35",
    );
    expect(res.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { orders } = await import("@/db/schema");
    const row = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(row[0].status).toBe("مؤكد");
    expect(row[0].deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row[0].confirmationDate).not.toBeNull();
  });

  // ────────────── Fix 4 — BR-18 ──────────────

  async function cancelOrder(
    orderId: number,
    claims: { id: number; username: string; role: string; name: string },
    body: {
      reason: string;
      returnToStock: boolean;
      sellerBonusAction: string;
      driverBonusAction: string;
    },
    idemSuffix: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.ordersCancel.POST(
      new Request(`http://localhost/api/v1/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `41-cancel-${orderId}-${idemSuffix}`,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(orderId) }) },
    );
  }

  async function confirmedOrder(idemTag: string): Promise<{ orderId: number }> {
    const { orderId } = await createReadyOrder(sellerClaims(), [
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    const { deliveryId } = await createDelivery(orderId, { assignedDriverId: driverId });
    await startDelivery(deliveryId, driverClaims(), idemTag);
    const confirmRes = await confirmDelivery(
      deliveryId,
      driverClaims(),
      { paidAmount: 100, paymentMethod: "كاش" },
      idemTag,
    );
    expect(confirmRes.status).toBe(200);
    return { orderId };
  }

  it("BR-18 keep: cancel confirmed order → bonuses flipped to 'retained'", async () => {
    const { orderId } = await confirmedOrder("br18-keep");
    const res = await cancelOrder(
      orderId,
      adminClaims(),
      {
        reason: "تجربة keep",
        returnToStock: false,
        sellerBonusAction: "keep",
        driverBonusAction: "keep",
      },
      "br18-keep",
    );
    expect(res.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { bonuses } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db
        .select()
        .from(bonuses)
        .where(and(eq(bonuses.orderId, orderId), isNull(bonuses.deletedAt))),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.status).toBe("retained");
  });

  it("BR-18 cancel_unpaid: cancel confirmed order → bonuses soft-deleted", async () => {
    const { orderId } = await confirmedOrder("br18-cu");
    const res = await cancelOrder(
      orderId,
      adminClaims(),
      {
        reason: "تجربة cancel_unpaid",
        returnToStock: false,
        sellerBonusAction: "cancel_unpaid",
        driverBonusAction: "cancel_unpaid",
      },
      "br18-cu",
    );
    expect(res.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { bonuses } = await import("@/db/schema");
    const liveRows = await withRead(undefined, (db) =>
      db
        .select()
        .from(bonuses)
        .where(and(eq(bonuses.orderId, orderId), isNull(bonuses.deletedAt))),
    );
    expect(liveRows.length).toBe(0);
    const allRows = await withRead(undefined, (db) =>
      db.select().from(bonuses).where(eq(bonuses.orderId, orderId)),
    );
    expect(allRows.length).toBeGreaterThanOrEqual(2);
    for (const r of allRows) expect(r.deletedAt).not.toBeNull();
  });

  it("BR-18 cancel_as_debt: confirmed order → 412 SETTLEMENT_FLOW_NOT_SHIPPED", async () => {
    const { orderId } = await confirmedOrder("br18-dbt");
    const res = await cancelOrder(
      orderId,
      adminClaims(),
      {
        reason: "تجربة cancel_as_debt",
        returnToStock: false,
        sellerBonusAction: "cancel_as_debt",
        driverBonusAction: "keep",
      },
      "br18-dbt",
    );
    expect(res.status).toBe(412);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("SETTLEMENT_FLOW_NOT_SHIPPED");

    // Transaction must roll back — bonuses stay intact, order stays مؤكد.
    const { withRead } = await import("@/db/client");
    const { bonuses, orders } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db
        .select()
        .from(bonuses)
        .where(and(eq(bonuses.orderId, orderId), isNull(bonuses.deletedAt))),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.status).toBe("unpaid");
    const ord = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(ord[0].status).toBe("مؤكد");
  });

  it("BR-18 pre-confirmed cancel: no bonus rows affected (none exist)", async () => {
    // Create an order in 'محجوز', cancel it directly.
    const r = await freshRoutes(sellerClaims());
    const create = await r.orders.POST(
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
    const { order } = (await create.json()) as { order: { id: number } };

    const res = await cancelOrder(
      order.id,
      sellerClaims(),
      {
        reason: "إلغاء قبل التأكيد",
        returnToStock: true,
        sellerBonusAction: "cancel_as_debt", // would throw if applied, but must be skipped
        driverBonusAction: "cancel_as_debt",
      },
      "br18-pre",
    );
    expect(res.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { bonuses } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db.select().from(bonuses).where(eq(bonuses.orderId, order.id)),
    );
    expect(rows.length).toBe(0);
  });
});
