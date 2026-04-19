import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Integration tests for POST /api/v1/users + PUT /api/v1/users/[id].
// SKIPPED without TEST_DATABASE_URL.

describe.skipIf(!HAS_DB)("/api/v1/users — POST + PUT round-trip (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    delete process.env.INIT_BOOTSTRAP_SECRET;
    await resetSchema();
    await applyMigrations();

    // Seed admin via /api/init so the route authorizer has a pm/gm user.
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

  // Mocks @/auth so route handlers see the admin session.
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

  async function freshRoute(): Promise<{
    POST: typeof import("@/app/api/v1/users/route")["POST"];
    GET: typeof import("@/app/api/v1/users/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/users/route");
  }

  async function freshDynamicRoute(): Promise<{
    PUT: typeof import("@/app/api/v1/users/[id]/route")["PUT"];
    GET: typeof import("@/app/api/v1/users/[id]/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/users/[id]/route");
  }

  it("POST creates a user, hashed with Argon2id, visible via GET list", async () => {
    const { POST, GET } = await freshRoute();
    const createRes = await POST(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "seller_one",
          password: "StrongPassw0rd!",
          name: "بائع أول",
          role: "seller",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { user: { id: number; username: string } };
    expect(createBody.user.username).toBe("seller_one");

    // DB-level: hash is Argon2id
    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(users).where(eq(users.username, "seller_one")).limit(1),
    );
    expect(rows[0].password).toMatch(/^\$argon2id\$/);

    // GET list includes the new user
    const listRes = await GET(new Request("http://localhost/api/v1/users"));
    const listBody = (await listRes.json()) as {
      users: Array<{ username: string }>;
      total: number;
    };
    expect(listBody.total).toBeGreaterThanOrEqual(2); // admin + seller_one
    expect(listBody.users.some((u) => u.username === "seller_one")).toBe(true);
  });

  it("POST rejects duplicate username with 409 DUPLICATE_USERNAME", async () => {
    const { POST } = await freshRoute();
    const dupRes = await POST(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "seller_one", // already exists from previous test
          password: "AnotherPass99!",
          name: "مكرر",
          role: "seller",
        }),
      }),
    );
    expect(dupRes.status).toBe(409);
    const body = (await dupRes.json()) as { code: string };
    expect(body.code).toBe("DUPLICATE_USERNAME");
  });

  it("POST rejects missing fields with 400 VALIDATION_FAILED", async () => {
    const { POST } = await freshRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "x" }), // username too short + missing password/name/role
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("PUT updates name + active; partial patch applies", async () => {
    // Find the seller_one id
    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(users).where(eq(users.username, "seller_one")).limit(1),
    );
    const sellerId = rows[0].id;

    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/users/${sellerId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "بائع محدَّث", active: false }),
      }),
      { params: Promise.resolve({ id: String(sellerId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { name: string; active: boolean } };
    expect(body.user.name).toBe("بائع محدَّث");
    expect(body.user.active).toBe(false);
  });

  it("PUT with empty patch → 400 VALIDATION_FAILED (refine rule)", async () => {
    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/users/${adminUserId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: String(adminUserId) }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("PUT on missing user → 404 NOT_FOUND", async () => {
    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request("http://localhost/api/v1/users/999999", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
      { params: Promise.resolve({ id: "999999" }) },
    );
    expect(res.status).toBe(404);
  });

  it("POST without pm/gm session → 403 FORBIDDEN", async () => {
    // Re-mock auth as seller
    vi.resetModules();
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: "99", username: "nobody", role: "seller", name: "N" },
      }),
    }));
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    const { POST } = await import("@/app/api/v1/users/route");

    const res = await POST(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "hacker",
          password: "Password123!",
          name: "x",
          role: "pm",
        }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("FORBIDDEN");
  });
});
