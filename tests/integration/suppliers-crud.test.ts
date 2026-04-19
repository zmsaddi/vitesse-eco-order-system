import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Integration tests for /api/v1/suppliers — POST + GET + PUT.
// Phase 2c: minimal CRUD coverage. SKIPPED without TEST_DATABASE_URL.

describe.skipIf(!HAS_DB)("/api/v1/suppliers — CRUD (requires TEST_DATABASE_URL)", () => {
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
    POST: typeof import("@/app/api/v1/suppliers/route")["POST"];
    GET: typeof import("@/app/api/v1/suppliers/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/suppliers/route");
  }

  async function freshDynamicRoute(): Promise<{
    PUT: typeof import("@/app/api/v1/suppliers/[id]/route")["PUT"];
    GET: typeof import("@/app/api/v1/suppliers/[id]/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/suppliers/[id]/route");
  }

  it("POST creates a supplier with all fields (201)", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "مورد القاهرة",
          phone: "+33111111111",
          address: "Paris",
          notes: "ملاحظة",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { supplier: { id: number; name: string } };
    expect(body.supplier.name).toBe("مورد القاهرة");
  });

  // Phase 2c.1 — dedup guard. Requires migration 0004 (partial unique on name+phone).
  it("POST rejects duplicate (name, phone) with 409 DUPLICATE_SUPPLIER", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "مورد القاهرة",
          phone: "+33111111111", // same (name, phone) pair as the first case
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; details?: { axis?: string } };
    expect(body.code).toBe("DUPLICATE_SUPPLIER");
    expect(body.details?.axis).toBe("phone");
  });

  it("POST allows same name when phone is empty (partial index doesn't fire)", async () => {
    const { POST } = await freshListRoute();
    const res1 = await POST(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "مورد بلا هاتف", phone: "" }),
      }),
    );
    expect(res1.status).toBe(201);
    const res2 = await POST(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "مورد بلا هاتف", phone: "" }),
      }),
    );
    expect(res2.status).toBe(201);
  });

  it("PUT that would collide with ANOTHER supplier → 409 (the Fix 1b update path)", async () => {
    // Create a second supplier with a unique phone.
    const { POST } = await freshListRoute();
    await POST(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "مورد-ب",
          phone: "+33122222222",
        }),
      }),
    );

    const { withRead } = await import("@/db/client");
    const { suppliers } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(suppliers).where(eq(suppliers.name, "مورد-ب")).limit(1),
    );
    const secondId = rows[0].id;

    // Attempt to update secondId to collide with the first supplier's (name, phone).
    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/suppliers/${secondId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "مورد القاهرة",
          phone: "+33111111111",
        }),
      }),
      { params: Promise.resolve({ id: String(secondId) }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("DUPLICATE_SUPPLIER");
  });

  it("GET lists suppliers with pagination", async () => {
    const { GET } = await freshListRoute();
    const res = await GET(new Request("http://localhost/api/v1/suppliers?limit=10&offset=0"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suppliers: unknown[]; total: number };
    expect(Array.isArray(body.suppliers)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("PUT updates a supplier (200)", async () => {
    const { withRead } = await import("@/db/client");
    const { suppliers } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(suppliers).where(eq(suppliers.name, "مورد القاهرة")).limit(1),
    );
    const supplierId = rows[0].id;

    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/suppliers/${supplierId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: "Lyon",
        }),
      }),
      { params: Promise.resolve({ id: String(supplierId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { supplier: { address: string } };
    expect(body.supplier.address).toBe("Lyon");
  });

  it("PUT with unknown id returns 404", async () => {
    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request("http://localhost/api/v1/suppliers/999999", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
      { params: Promise.resolve({ id: "999999" }) },
    );
    expect(res.status).toBe(404);
  });

  it("Seller POST returns 403 (seller cannot mutate suppliers)", async () => {
    vi.resetModules();
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: "99", username: "s1", role: "seller", name: "Seller" },
      }),
    }));
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();

    const { POST } = await import("@/app/api/v1/suppliers/route");
    const res = await POST(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("Stock_keeper GET succeeds but POST returns 403 (read-only)", async () => {
    vi.resetModules();
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: "99", username: "sk", role: "stock_keeper", name: "SK" },
      }),
    }));
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();

    const { GET, POST } = await import("@/app/api/v1/suppliers/route");
    const getRes = await GET(new Request("http://localhost/api/v1/suppliers"));
    expect(getRes.status).toBe(200);

    const postRes = await POST(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "y" }),
      }),
    );
    expect(postRes.status).toBe(403);
  });
});
