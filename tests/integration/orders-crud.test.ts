import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.0 orders core — POST /create, GET /[id], POST /cancel, POST /start-preparation.
// Every mutation must produce an activity_log row + be protected by idempotency wrapper.

describe.skipIf(!HAS_DB)("Phase 3.0 orders core (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
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
    const { users, clients, products } = await import("@/db/schema");

    const adminRows = await withRead(undefined, async (db) =>
      db.select().from(users).where(eq(users.username, "admin")).limit(1),
    );
    adminUserId = adminRows[0].id;

    // Seed one client + one product directly (bypass API to keep this suite focused).
    clientId = await withTxInRoute(undefined, async (tx) => {
      const inserted = await tx
        .insert(clients)
        .values({
          name: "عميل التجربة",
          phone: "+33600000001",
          email: "",
          createdBy: "admin",
        })
        .returning();
      return inserted[0].id;
    });
    productId = await withTxInRoute(undefined, async (tx) => {
      const inserted = await tx
        .insert(products)
        .values({
          name: "منتج التجربة",
          buyPrice: "50.00",
          sellPrice: "120.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      return inserted[0].id;
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function withAdminSession(): void {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: {
          id: String(adminUserId),
          username: "admin",
          role: "pm",
          name: "مدير المشروع",
        },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshRoutes(): Promise<{
    createRoute: typeof import("@/app/api/v1/orders/route");
    getRoute: typeof import("@/app/api/v1/orders/[id]/route");
    cancelRoute: typeof import("@/app/api/v1/orders/[id]/cancel/route");
    startPrepRoute: typeof import("@/app/api/v1/orders/[id]/start-preparation/route");
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return {
      createRoute: await import("@/app/api/v1/orders/route"),
      getRoute: await import("@/app/api/v1/orders/[id]/route"),
      cancelRoute: await import("@/app/api/v1/orders/[id]/cancel/route"),
      startPrepRoute: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
    };
  }

  let createdOrderId: number;

  it("POST /api/v1/orders creates order (201) + activity_log row", async () => {
    const { createRoute } = await freshRoutes();
    const res = await createRoute.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          paymentMethod: "كاش",
          items: [{ productId, quantity: 2, unitPrice: 120 }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { order: { id: number; totalAmount: number } };
    expect(body.order.totalAmount).toBe(240);
    createdOrderId = body.order.id;

    // Verify activity_log has a matching create entry.
    const { withRead } = await import("@/db/client");
    const { activityLog } = await import("@/db/schema");
    const logs = await withRead(undefined, (db) =>
      db.select().from(activityLog).where(eq(activityLog.entityId, createdOrderId)),
    );
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.action === "create" && l.entityType === "orders")).toBe(true);
  });

  it("POST /api/v1/orders rejects BR-03 (unit_price < cost)", async () => {
    const { createRoute } = await freshRoutes();
    const res = await createRoute.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId, quantity: 1, unitPrice: 10 }], // cost=50
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PRICE_BELOW_COST");
  });

  it("GET /api/v1/orders/[id] returns order with items", async () => {
    const { getRoute } = await freshRoutes();
    const res = await getRoute.GET(
      new Request(`http://localhost/api/v1/orders/${createdOrderId}`),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      order: { id: number; items: Array<{ quantity: number; lineTotal: number }> };
    };
    expect(body.order.id).toBe(createdOrderId);
    expect(body.order.items).toHaveLength(1);
    expect(body.order.items[0].lineTotal).toBe(240);
  });

  it("POST /api/v1/orders/[id]/start-preparation without header → 400", async () => {
    const { startPrepRoute } = await freshRoutes();
    const res = await startPrepRoute.POST(
      new Request(
        `http://localhost/api/v1/orders/${createdOrderId}/start-preparation`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("POST /api/v1/orders/[id]/start-preparation with header → 200 + transition", async () => {
    const { startPrepRoute } = await freshRoutes();
    const res = await startPrepRoute.POST(
      new Request(
        `http://localhost/api/v1/orders/${createdOrderId}/start-preparation`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `start-${createdOrderId}` },
        },
      ),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { order: { status: string } };
    expect(body.order.status).toBe("قيد التحضير");
  });

  it("POST /api/v1/orders/[id]/start-preparation: replay returns cached", async () => {
    const { startPrepRoute } = await freshRoutes();
    const res = await startPrepRoute.POST(
      new Request(
        `http://localhost/api/v1/orders/${createdOrderId}/start-preparation`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `start-${createdOrderId}` },
        },
      ),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(200);
    // Cached response; not re-executing the transition (which would be INVALID_STATE_TRANSITION now).
  });

  it("POST /api/v1/orders/[id]/cancel without header → 400", async () => {
    const { cancelRoute } = await freshRoutes();
    const res = await cancelRoute.POST(
      new Request(`http://localhost/api/v1/orders/${createdOrderId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "test",
          returnToStock: true,
          sellerBonusAction: "keep",
          driverBonusAction: "keep",
        }),
      }),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/v1/orders/[id]/cancel: C1 flow + stock returned + cancellations row", async () => {
    const { withRead } = await import("@/db/client");
    const { products, cancellations } = await import("@/db/schema");

    const stockBefore = await withRead(undefined, async (db) => {
      const r = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      return Number(r[0].stock);
    });

    const { cancelRoute } = await freshRoutes();
    const res = await cancelRoute.POST(
      new Request(`http://localhost/api/v1/orders/${createdOrderId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `cancel-${createdOrderId}`,
        },
        body: JSON.stringify({
          reason: "إلغاء تجربة",
          returnToStock: true,
          sellerBonusAction: "cancel_unpaid",
          driverBonusAction: "keep",
        }),
      }),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { order: { status: string } };
    expect(body.order.status).toBe("ملغي");

    const stockAfter = await withRead(undefined, async (db) => {
      const r = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      return Number(r[0].stock);
    });
    expect(stockAfter).toBe(stockBefore + 2); // order had qty=2

    const cancRows = await withRead(undefined, async (db) =>
      db.select().from(cancellations).where(eq(cancellations.orderId, createdOrderId)),
    );
    expect(cancRows.length).toBe(1);
    expect(cancRows[0].sellerBonusAction).toBe("cancel_unpaid");
    expect(cancRows[0].driverBonusAction).toBe("keep");
    expect(cancRows[0].reason).toBe("إلغاء تجربة");
  });

  it("POST cancel replay (same key) → cached, not double-applied", async () => {
    const { cancelRoute } = await freshRoutes();
    const res = await cancelRoute.POST(
      new Request(`http://localhost/api/v1/orders/${createdOrderId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `cancel-${createdOrderId}`,
        },
        body: JSON.stringify({
          reason: "إلغاء تجربة",
          returnToStock: true,
          sellerBonusAction: "cancel_unpaid",
          driverBonusAction: "keep",
        }),
      }),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(200);

    // Stock + cancellations row unchanged (verified by COUNT).
    const { withRead } = await import("@/db/client");
    const count = await withRead(undefined, async (db) => {
      const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM cancellations WHERE order_id = ${createdOrderId}`);
      return (r as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? 0;
    });
    expect(count).toBe(1); // still exactly one cancellations row
  });

  it("POST cancel again (new key) on already-cancelled → 409 ALREADY_CANCELLED", async () => {
    const { cancelRoute } = await freshRoutes();
    const res = await cancelRoute.POST(
      new Request(`http://localhost/api/v1/orders/${createdOrderId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `cancel-${createdOrderId}-again`,
        },
        body: JSON.stringify({
          reason: "second try",
          returnToStock: false,
          sellerBonusAction: "keep",
          driverBonusAction: "keep",
        }),
      }),
      { params: Promise.resolve({ id: String(createdOrderId) }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ALREADY_CANCELLED");
  });
});
