import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.0.1 targeted fixes (reviewer's 4 gaps):
//   1. Orders ownership/visibility — seller isolation, driver/stock_keeper 403.
//   2. PUT /expenses/[id] cannot make a normal row's amount negative.
//   3. Cancellations hash-chain advisory-locked + verifiable.
//   4. orders + purchases ref_code generated in canonical pattern.

describe.skipIf(!HAS_DB)("Phase 3.0.1 fixes (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerAId: number;
  let sellerBId: number;
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

    const adminRows = await withRead(undefined, (db) =>
      db.select().from(users).where(eq(users.username, "admin")).limit(1),
    );
    adminUserId = adminRows[0].id;

    // Seed two seller users directly (bypassing hash generation for speed; these
    // users are only used via mocked session — password validation not exercised).
    [sellerAId, sellerBId] = await withTxInRoute(undefined, async (tx) => {
      const { hashPassword } = await import("@/lib/password");
      const hash = await hashPassword("test-pass-3.0.1");
      const a = await tx
        .insert(users)
        .values({
          username: "sellerA",
          password: hash,
          name: "البائع A",
          role: "seller",
          active: true,
        })
        .returning();
      const b = await tx
        .insert(users)
        .values({
          username: "sellerB",
          password: hash,
          name: "البائع B",
          role: "seller",
          active: true,
        })
        .returning();
      return [a[0].id, b[0].id];
    });

    clientId = await withTxInRoute(undefined, async (tx) => {
      const r = await tx
        .insert(clients)
        .values({ name: "عميل 3.0.1", phone: "+33600999001", createdBy: "admin" })
        .returning();
      return r[0].id;
    });
    productId = await withTxInRoute(undefined, async (tx) => {
      const r = await tx
        .insert(products)
        .values({
          name: "منتج 3.0.1",
          buyPrice: "10.00",
          sellPrice: "30.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      return r[0].id;
    });
  });

  function mockSession(user: { id: number; username: string; role: string; name: string }): void {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: String(user.id), username: user.username, role: user.role, name: user.name },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshWithSession(user: { id: number; username: string; role: string; name: string }) {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession(user);
    return {
      ordersCreate: await import("@/app/api/v1/orders/route"),
      ordersDetail: await import("@/app/api/v1/orders/[id]/route"),
      ordersCancel: await import("@/app/api/v1/orders/[id]/cancel/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      expensesList: await import("@/app/api/v1/expenses/route"),
      expensesItem: await import("@/app/api/v1/expenses/[id]/route"),
    };
  }

  // ─────────── Fix #4: refCode pattern ───────────

  it("Fix 4 — createOrder generates ref_code ORD-YYYYMMDD-NNNNN", async () => {
    const routes = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
    const res = await routes.ordersCreate.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId, quantity: 1, unitPrice: 30 }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { order: { refCode: string; id: number } };
    expect(body.order.refCode).toMatch(/^ORD-\d{8}-\d{5}$/);
  });

  it("Fix 4 — second order on same day has incremented counter", async () => {
    const routes = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
    const first = await routes.ordersCreate.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId, quantity: 1, unitPrice: 30 }],
        }),
      }),
    );
    const f = (await first.json()) as { order: { refCode: string } };
    const second = await routes.ordersCreate.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId, quantity: 1, unitPrice: 30 }],
        }),
      }),
    );
    const s = (await second.json()) as { order: { refCode: string } };
    const fNum = Number(f.order.refCode.split("-")[2]);
    const sNum = Number(s.order.refCode.split("-")[2]);
    expect(sNum).toBe(fNum + 1);
  });

  it("Fix 4 — createPurchase generates ref_code PU-YYYYMMDD-NNNNN", async () => {
    const routes = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
    // Need a supplier first.
    const { withTxInRoute } = await import("@/db/client");
    const { suppliers } = await import("@/db/schema");
    const supplierId = await withTxInRoute(undefined, async (tx) => {
      const r = await tx
        .insert(suppliers)
        .values({ name: "مورد 3.0.1", phone: "+33600999002" })
        .returning();
      return r[0].id;
    });
    const res = await routes.purchases.POST(
      new Request("http://localhost/api/v1/purchases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-04-20",
          supplierId,
          productId,
          quantity: 5,
          unitPrice: 12,
          paidAmount: 60,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { purchase: { refCode: string } };
    expect(body.purchase.refCode).toMatch(/^PU-\d{8}-\d{5}$/);
  });

  // ─────────── Fix #1: Orders ownership/visibility ───────────

  let orderByAId: number;

  it("Fix 1 setup — sellerA creates an order", async () => {
    const routes = await freshWithSession({ id: sellerAId, username: "sellerA", role: "seller", name: "A" });
    const res = await routes.ordersCreate.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId, quantity: 1, unitPrice: 30 }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { order: { id: number; createdBy: string } };
    expect(body.order.createdBy).toBe("sellerA");
    orderByAId = body.order.id;
  });

  it("Fix 1 — sellerB GET sellerA's order → 403 FORBIDDEN", async () => {
    const routes = await freshWithSession({ id: sellerBId, username: "sellerB", role: "seller", name: "B" });
    const res = await routes.ordersDetail.GET(
      new Request(`http://localhost/api/v1/orders/${orderByAId}`),
      { params: Promise.resolve({ id: String(orderByAId) }) },
    );
    expect(res.status).toBe(403);
  });

  it("Fix 1 — sellerA GET own order → 200", async () => {
    const routes = await freshWithSession({ id: sellerAId, username: "sellerA", role: "seller", name: "A" });
    const res = await routes.ordersDetail.GET(
      new Request(`http://localhost/api/v1/orders/${orderByAId}`),
      { params: Promise.resolve({ id: String(orderByAId) }) },
    );
    expect(res.status).toBe(200);
  });

  it("Fix 1 — sellerB POST cancel on sellerA's order → 403", async () => {
    const routes = await freshWithSession({ id: sellerBId, username: "sellerB", role: "seller", name: "B" });
    const res = await routes.ordersCancel.POST(
      new Request(`http://localhost/api/v1/orders/${orderByAId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `steal-${orderByAId}`,
        },
        body: JSON.stringify({
          reason: "محاولة سرقة",
          returnToStock: false,
          sellerBonusAction: "keep",
          driverBonusAction: "keep",
        }),
      }),
      { params: Promise.resolve({ id: String(orderByAId) }) },
    );
    expect(res.status).toBe(403);
  });

  it("Fix 1 — driver GET any order → 403 (no delivery linkage in Phase 3.0)", async () => {
    const routes = await freshWithSession({ id: 999, username: "drv", role: "driver", name: "D" });
    const res = await routes.ordersDetail.GET(
      new Request(`http://localhost/api/v1/orders/${orderByAId}`),
      { params: Promise.resolve({ id: String(orderByAId) }) },
    );
    expect(res.status).toBe(403);
  });

  it("Fix 1 — stock_keeper GET order → 403", async () => {
    const routes = await freshWithSession({ id: 998, username: "sk", role: "stock_keeper", name: "SK" });
    const res = await routes.ordersDetail.GET(
      new Request(`http://localhost/api/v1/orders/${orderByAId}`),
      { params: Promise.resolve({ id: String(orderByAId) }) },
    );
    expect(res.status).toBe(403);
  });

  it("Fix 1 — manager cancel on status != 'محجوز' → 403", async () => {
    // First transition order to قيد التحضير via admin (has rights).
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const startPrep = await import("@/app/api/v1/orders/[id]/start-preparation/route");
    const prepRes = await startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${orderByAId}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `prep-${orderByAId}` },
      }),
      { params: Promise.resolve({ id: String(orderByAId) }) },
    );
    expect(prepRes.status).toBe(200);

    // Now manager attempts cancel — allowed endpoint role, but status != 'محجوز' → 403 from service.
    const managerRoutes = await freshWithSession({
      id: 997,
      username: "mgr",
      role: "manager",
      name: "M",
    });
    const cancelRes = await managerRoutes.ordersCancel.POST(
      new Request(`http://localhost/api/v1/orders/${orderByAId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `mgr-cancel-${orderByAId}`,
        },
        body: JSON.stringify({
          reason: "manager trying",
          returnToStock: false,
          sellerBonusAction: "keep",
          driverBonusAction: "keep",
        }),
      }),
      { params: Promise.resolve({ id: String(orderByAId) }) },
    );
    expect(cancelRes.status).toBe(403);
  });

  // ─────────── Fix #2: PUT cannot bypass D-82 via negative amount ───────────

  it("Fix 2 — PUT /expenses/[id] with negative amount → 400 (DTO refuses)", async () => {
    const routes = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const createRes = await routes.expensesList.POST(
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-04-20",
          category: "test",
          description: "exp-to-bypass",
          amount: 100,
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { expense: { id: number } };

    const putRes = await routes.expensesItem.PUT(
      new Request(`http://localhost/api/v1/expenses/${created.expense.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: -50 }),
      }),
      { params: Promise.resolve({ id: String(created.expense.id) }) },
    );
    expect(putRes.status).toBe(400);
    const body = (await putRes.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED"); // refused at DTO layer
  });

  // ─────────── Fix #3: Cancellations hash-chain advisory-locked + verifiable ───────────

  it("Fix 3 — cancellations hash-chain: 3 sequential cancels → chain verifies", async () => {
    const { withRead, withTxInRoute } = await import("@/db/client");
    const { orders, products } = await import("@/db/schema");
    const adminRoutes = await freshWithSession({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });

    // Create 3 orders and cancel all.
    for (let i = 0; i < 3; i++) {
      const cRes = await adminRoutes.ordersCreate.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-20",
            items: [{ productId, quantity: 1, unitPrice: 30 }],
          }),
        }),
      );
      expect(cRes.status).toBe(201);
      const cBody = (await cRes.json()) as { order: { id: number } };
      const oid = cBody.order.id;

      // Fresh session per cancel to match the route's session-read path.
      const routes2 = await freshWithSession({
        id: adminUserId,
        username: "admin",
        role: "pm",
        name: "A",
      });
      const kRes = await routes2.ordersCancel.POST(
        new Request(`http://localhost/api/v1/orders/${oid}/cancel`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `chain-${oid}`,
          },
          body: JSON.stringify({
            reason: `chain test #${i}`,
            returnToStock: true,
            sellerBonusAction: "keep",
            driverBonusAction: "keep",
          }),
        }),
        { params: Promise.resolve({ id: String(oid) }) },
      );
      expect(kRes.status).toBe(200);
    }
    void orders; void products;

    const corrupt = await withTxInRoute(undefined, async (tx) => {
      const { verifyCancellationsChain } = await import("@/modules/orders/service");
      return verifyCancellationsChain(tx);
    });
    expect(corrupt).toBeNull();

    // Row count sanity: we created 3 cancellations in this sub-suite; more may
    // already exist from earlier suites reset into this branch.
    const total = await withRead(undefined, async (db) => {
      const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM cancellations`);
      return (r as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? 0;
    });
    expect(total).toBeGreaterThanOrEqual(3);
  });
});
