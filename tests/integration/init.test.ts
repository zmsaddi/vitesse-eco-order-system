import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// POST /api/init — first-run bootstrap (D-24) + Phase 1a hardening (INIT_BOOTSTRAP_SECRET).
// SKIPPED when TEST_DATABASE_URL is not set.
//
// Phase 1a.1 corrections applied:
//   - Each test flushes the env singleton (resetEnvCacheForTesting) so process.env
//     mutations inside the test actually take effect. Without this, Phase 1a's tests
//     could pass for the wrong reason (cached env snapshot masked later changes).
//   - Each test also calls vi.resetModules() so the route module is re-imported
//     after env is set. That way any module-level side effects are exercised freshly.
//   - Tests that assert "401 before DB work" verify the absence of any inserted row,
//     not just the status code.

describe.skipIf(!HAS_DB)("/api/init — first-run + hardening (requires TEST_DATABASE_URL)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
  });

  beforeEach(async () => {
    const { resetEnvCacheForTesting } = await import("@/lib/env");
    resetEnvCacheForTesting();
    vi.restoreAllMocks();
  });

  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/init", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
    });
  }

  // Per-test helper: reset DB + apply migrations + reimport the route with fresh env.
  async function freshRoute() {
    await resetSchema();
    await applyMigrations();
    vi.resetModules();
    const { resetEnvCacheForTesting } = await import("@/lib/env");
    resetEnvCacheForTesting();
    const mod = await import("@/app/api/init/route");
    return mod.POST;
  }

  it("first-run succeeds when INIT_BOOTSTRAP_SECRET not configured (dev default)", async () => {
    delete process.env.INIT_BOOTSTRAP_SECRET;
    const POST = await freshRoute();

    const res = await POST(makeRequest() as never);
    const body = (await res.json()) as {
      ok: boolean;
      adminUsername: string;
      adminPassword: string;
      seeded: { users: number; permissions: number; settings: number };
    };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.adminUsername).toBe("admin");
    expect(body.adminPassword).toHaveLength(24);
    expect(body.seeded.users).toBe(1);
    expect(body.seeded.permissions).toBeGreaterThan(30);
    expect(body.seeded.settings).toBeGreaterThan(20);
  });

  it("second-run rejected with 409 ALREADY_INITIALIZED (same DB state)", async () => {
    // Do NOT reset schema — reuse the DB from previous test to exercise idempotency.
    // But we DO need the route re-imported with fresh env (no secret in this case).
    delete process.env.INIT_BOOTSTRAP_SECRET;
    vi.resetModules();
    const { resetEnvCacheForTesting } = await import("@/lib/env");
    resetEnvCacheForTesting();
    const { POST } = await import("@/app/api/init/route");

    const res = await POST(makeRequest() as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ALREADY_INITIALIZED");
  });

  it("with INIT_BOOTSTRAP_SECRET set and missing header → 401 (no DB work)", async () => {
    process.env.INIT_BOOTSTRAP_SECRET = "super-long-secret-at-least-16chars!!";
    const POST = await freshRoute();

    const res = await POST(makeRequest() as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INIT_UNAUTHORIZED");

    // Verify 401 happened BEFORE any DB work: no user should have been created.
    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) => db.select().from(users).limit(1));
    expect(rows).toHaveLength(0);
  });

  it("with INIT_BOOTSTRAP_SECRET set and wrong header → 401 (no DB work)", async () => {
    process.env.INIT_BOOTSTRAP_SECRET = "super-long-secret-at-least-16chars!!";
    const POST = await freshRoute();

    const res = await POST(makeRequest({ "x-init-secret": "wrong-value-here" }) as never);
    expect(res.status).toBe(401);

    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) => db.select().from(users).limit(1));
    expect(rows).toHaveLength(0);
  });

  it("with INIT_BOOTSTRAP_SECRET set and correct header → 200 (user inserted)", async () => {
    const secret = "super-long-secret-at-least-16chars!!";
    process.env.INIT_BOOTSTRAP_SECRET = secret;
    const POST = await freshRoute();

    const res = await POST(makeRequest({ "x-init-secret": secret }) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; adminUsername: string };
    expect(body.ok).toBe(true);
    expect(body.adminUsername).toBe("admin");

    // Verify user was actually inserted.
    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) => db.select().from(users).limit(1));
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("admin");
    expect(rows[0].password).toMatch(/^\$argon2id\$/);
  });

  it("production without INIT_BOOTSTRAP_SECRET → 503 INIT_DISABLED", async () => {
    delete process.env.INIT_BOOTSTRAP_SECRET;
    // vi.stubEnv handles NODE_ENV (read-only in TS types) cleanly and restores on unstub.
    vi.stubEnv("NODE_ENV", "production");
    try {
      const POST = await freshRoute();
      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("INIT_DISABLED");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
