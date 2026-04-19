import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// POST /api/init — first-run bootstrap (D-24 + Phase 1a hardening).
// SKIPPED when TEST_DATABASE_URL is not set (keeps CI green without forcing Neon secret).

describe.skipIf(!HAS_DB)("/api/init — first-run + hardening (requires TEST_DATABASE_URL)", () => {
  let POST: typeof import("@/app/api/init/route")["POST"];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    await resetSchema();
    await applyMigrations();

    // Dynamic import AFTER env is set so src/lib/env.ts validates the test env.
    ({ POST } = await import("@/app/api/init/route"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/init", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
    });
  }

  it("first-run succeeds when INIT_BOOTSTRAP_SECRET not configured (dev default)", async () => {
    delete process.env.INIT_BOOTSTRAP_SECRET;
    await resetSchema();
    await applyMigrations();
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

  it("second-run rejected with 409 ALREADY_INITIALIZED", async () => {
    // Schema already populated by previous test — run init again
    const res = await POST(makeRequest() as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ALREADY_INITIALIZED");
  });

  it("with INIT_BOOTSTRAP_SECRET set and missing header → 401", async () => {
    await resetSchema();
    await applyMigrations();
    process.env.INIT_BOOTSTRAP_SECRET = "super-long-secret-at-least-16chars!!";
    const res = await POST(makeRequest() as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INIT_UNAUTHORIZED");
  });

  it("with INIT_BOOTSTRAP_SECRET set and wrong header → 401", async () => {
    const res = await POST(makeRequest({ "x-init-secret": "wrong" }) as never);
    expect(res.status).toBe(401);
  });

  it("with INIT_BOOTSTRAP_SECRET set and correct header → 200", async () => {
    await resetSchema();
    await applyMigrations();
    const secret = "super-long-secret-at-least-16chars!!";
    process.env.INIT_BOOTSTRAP_SECRET = secret;
    const res = await POST(makeRequest({ "x-init-secret": secret }) as never);
    expect(res.status).toBe(200);
  });
});
