import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// /api/v1/me — returns claims + user DTO + nav items for the signed-in user.
// Phase 2.1: admin is seeded in beforeAll (no silent 404 fallback).

describe.skipIf(!HAS_DB)("/api/v1/me — current user + nav (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    delete process.env.INIT_BOOTSTRAP_SECRET;

    await resetSchema();
    await applyMigrations();

    // Seed admin via /api/init so we have a real user row to look up.
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    const { POST } = await import("@/app/api/init/route");
    const initRes = await POST(new Request("http://localhost/api/init", { method: "POST" }) as never);
    if (initRes.status !== 200) throw new Error(`init failed: ${initRes.status}`);

    // Fetch the admin id (we'll need it to construct the mocked session).
    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(users).where(eq(users.username, "admin")).limit(1),
    );
    if (rows.length === 0) throw new Error("admin seeding failed");
    adminUserId = rows[0].id;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.doMock("@/auth", () => ({ auth: async () => null }));
    vi.resetModules();
    const { GET } = await import("@/app/api/v1/me/route");

    const res = await GET(new Request("http://localhost/api/v1/me"));
    expect(res.status).toBe(401);

    vi.doUnmock("@/auth");
  });

  it("returns claims + user + nav for authenticated admin (hard assertion, no silent skip)", async () => {
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
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();

    const { GET } = await import("@/app/api/v1/me/route");
    const res = await GET(new Request("http://localhost/api/v1/me"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      claims: { userId: number; username: string; role: string; name: string };
      user: { id: number; username: string; role: string; name: string; active: boolean };
      nav: { href: string; labelAr: string }[];
    };

    // Claims must match the mocked session exactly.
    expect(body.claims).toEqual({
      userId: adminUserId,
      username: "admin",
      role: "pm",
      name: "مدير المشروع",
    });

    // User DTO must be fresh from DB, not echoed from claims.
    expect(body.user.id).toBe(adminUserId);
    expect(body.user.username).toBe("admin");
    expect(body.user.role).toBe("pm");
    expect(body.user.active).toBe(true);

    // Nav must be pm's canonical list (action-hub first per D-72; /users present per Fix 4).
    expect(body.nav[0]).toEqual({ href: "/action-hub", labelAr: "مركز العمل" });
    expect(body.nav.some((n) => n.href === "/users")).toBe(true);
    expect(body.nav.length).toBeGreaterThanOrEqual(10); // pm has 11 items after Fix 4

    vi.doUnmock("@/auth");
  });

  it("returns 404 when session claims reference a missing user (hardened path)", async () => {
    // Mock auth to report a user id that does NOT exist in DB.
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: {
          id: "999999",
          username: "ghost",
          role: "pm",
          name: "شبح",
        },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();

    const { GET } = await import("@/app/api/v1/me/route");
    const res = await GET(new Request("http://localhost/api/v1/me"));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_FOUND");

    vi.doUnmock("@/auth");
  });
});
