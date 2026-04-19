import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Integration tests for /api/v1/products — POST + GET + PUT + BR-03 + SKU_LIMIT.
// Phase 2c: minimal CRUD coverage. SKIPPED without TEST_DATABASE_URL.

describe.skipIf(!HAS_DB)("/api/v1/products — CRUD (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;

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
    const initRes = await initPost(
      new Request("http://localhost/api/init", { method: "POST" }) as never,
    );
    if (initRes.status !== 200) throw new Error(`init failed: ${initRes.status}`);

    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(users).where(eq(users.username, "admin")).limit(1),
    );
    adminUserId = rows[0].id;
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

  async function freshListRoute(): Promise<{
    POST: typeof import("@/app/api/v1/products/route")["POST"];
    GET: typeof import("@/app/api/v1/products/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/products/route");
  }

  async function freshDynamicRoute(): Promise<{
    PUT: typeof import("@/app/api/v1/products/[id]/route")["PUT"];
    GET: typeof import("@/app/api/v1/products/[id]/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/products/[id]/route");
  }

  it("POST creates a product (201)", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "دراجة-1",
          buyPrice: 100,
          sellPrice: 150,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { product: { id: number; name: string } };
    expect(body.product.name).toBe("دراجة-1");
  });

  it("POST rejects duplicate name with 409", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "دراجة-1",
          buyPrice: 50,
          sellPrice: 90,
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("DUPLICATE_PRODUCT_NAME");
  });

  it("POST rejects BR-03 (sellPrice < buyPrice) via DTO validation (422)", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "دراجة-خطأ",
          buyPrice: 200,
          sellPrice: 100,
        }),
      }),
    );
    expect([400, 422]).toContain(res.status);
  });

  it("PUT updates stock + price (200)", async () => {
    const { withRead } = await import("@/db/client");
    const { products } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(products).where(eq(products.name, "دراجة-1")).limit(1),
    );
    const productId = rows[0].id;

    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stock: 25,
          sellPrice: 180,
        }),
      }),
      { params: Promise.resolve({ id: String(productId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { product: { stock: number; sellPrice: number } };
    expect(body.product.stock).toBe(25);
    expect(body.product.sellPrice).toBe(180);
  });

  it("PUT that violates BR-03 (sellPrice < current buyPrice) returns 400 PRICE_BELOW_COST", async () => {
    const { withRead } = await import("@/db/client");
    const { products } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(products).where(eq(products.name, "دراجة-1")).limit(1),
    );
    const productId = rows[0].id;

    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellPrice: 10 }), // current buyPrice=100
      }),
      { params: Promise.resolve({ id: String(productId) }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PRICE_BELOW_COST");
  });

  it("Seller GET allowed (catalog view), POST returns 403", async () => {
    vi.resetModules();
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: "99", username: "s1", role: "seller", name: "Seller" },
      }),
    }));
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();

    const { GET, POST } = await import("@/app/api/v1/products/route");
    const getRes = await GET(new Request("http://localhost/api/v1/products"));
    expect(getRes.status).toBe(200);

    const postRes = await POST(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", buyPrice: 1, sellPrice: 1 }),
      }),
    );
    expect(postRes.status).toBe(403);
  });
});
