import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.0 purchases — POST /create (weighted-avg) + POST /[id]/reverse.
// Both paths must write activity_log + be idempotency-protected.

describe.skipIf(!HAS_DB)("Phase 3.0 purchases (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let supplierId: number;
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
    const { users, suppliers, products } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(users).where(eq(users.username, "admin")).limit(1),
    );
    adminUserId = rows[0].id;

    supplierId = await withTxInRoute(undefined, async (tx) => {
      const r = await tx
        .insert(suppliers)
        .values({ name: "مورد التجربة", phone: "+33600000010" })
        .returning();
      return r[0].id;
    });
    productId = await withTxInRoute(undefined, async (tx) => {
      const r = await tx
        .insert(products)
        .values({
          name: "منتج المشترى",
          buyPrice: "100.00",
          sellPrice: "150.00",
          stock: "10.00",
          createdBy: "admin",
        })
        .returning();
      return r[0].id;
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function withAdminSession(): void {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: String(adminUserId), username: "admin", role: "pm", name: "admin" },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshRoutes(): Promise<{
    createRoute: typeof import("@/app/api/v1/purchases/route");
    reverseRoute: typeof import("@/app/api/v1/purchases/[id]/reverse/route");
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return {
      createRoute: await import("@/app/api/v1/purchases/route"),
      reverseRoute: await import("@/app/api/v1/purchases/[id]/reverse/route"),
    };
  }

  let purchaseId: number;

  it("POST /purchases: weighted-avg update + stock += qty", async () => {
    const { createRoute } = await freshRoutes();
    const res = await createRoute.POST(
      new Request("http://localhost/api/v1/purchases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-04-20",
          supplierId,
          productId,
          quantity: 10,
          unitPrice: 60, // weighted avg: (10*100 + 10*60) / 20 = 80
          paymentMethod: "كاش",
          paidAmount: 600, // fully paid
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { purchase: { id: number; total: number } };
    expect(body.purchase.total).toBe(600);
    purchaseId = body.purchase.id;

    const { withRead } = await import("@/db/client");
    const { products } = await import("@/db/schema");
    const prodRows = await withRead(undefined, (db) =>
      db.select().from(products).where(eq(products.id, productId)).limit(1),
    );
    expect(Number(prodRows[0].stock)).toBe(20);
    expect(Number(prodRows[0].buyPrice)).toBe(80);
  });

  it("POST /purchases/[id]/reverse without header → 400", async () => {
    const { reverseRoute } = await freshRoutes();
    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/purchases/${purchaseId}/reverse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "test", reversalPath: "refund_cash" }),
      }),
      { params: Promise.resolve({ id: String(purchaseId) }) },
    );
    expect(res.status).toBe(400);
  });

  it("POST /purchases/[id]/reverse (refund_cash): stock reverts + soft-delete", async () => {
    const { reverseRoute } = await freshRoutes();
    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/purchases/${purchaseId}/reverse`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `reverse-${purchaseId}`,
        },
        body: JSON.stringify({ reason: "تالف", reversalPath: "refund_cash" }),
      }),
      { params: Promise.resolve({ id: String(purchaseId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { purchase: { deletedAt: string | null } };
    expect(body.purchase.deletedAt).not.toBeNull();

    const { withRead } = await import("@/db/client");
    const { products } = await import("@/db/schema");
    const prodRows = await withRead(undefined, (db) =>
      db.select().from(products).where(eq(products.id, productId)).limit(1),
    );
    expect(Number(prodRows[0].stock)).toBe(10); // 20 - 10 reversed
  });

  it("POST /purchases/[id]/reverse again on soft-deleted → 409 ALREADY_REVERSED", async () => {
    const { reverseRoute } = await freshRoutes();
    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/purchases/${purchaseId}/reverse`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `reverse-${purchaseId}-try2`,
        },
        body: JSON.stringify({ reason: "x", reversalPath: "refund_cash" }),
      }),
      { params: Promise.resolve({ id: String(purchaseId) }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ALREADY_REVERSED");
  });

  it("POST /purchases/[id]/reverse supplier_credit path", async () => {
    // Create a fresh purchase to reverse with the supplier_credit path.
    const { createRoute, reverseRoute } = await freshRoutes();
    const createRes = await createRoute.POST(
      new Request("http://localhost/api/v1/purchases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-04-20",
          supplierId,
          productId,
          quantity: 5,
          unitPrice: 90,
          paidAmount: 0, // fully on credit
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as { purchase: { id: number } };
    const id2 = createdBody.purchase.id;

    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/purchases/${id2}/reverse`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `reverse-${id2}`,
        },
        body: JSON.stringify({ reason: "credit", reversalPath: "supplier_credit" }),
      }),
      { params: Promise.resolve({ id: String(id2) }) },
    );
    expect(res.status).toBe(200);
  });
});
