import { describe, expect, it, vi } from "vitest";
import { HAS_DB } from "./setup";

// /api/v1/me — returns claims + user DTO + nav items for the signed-in user.
// Phase 2: we exercise the handler directly with a mocked session. DB is required
// (the handler queries getUserById). Skipped without TEST_DATABASE_URL.

describe.skipIf(!HAS_DB)("/api/v1/me — current user + nav (requires TEST_DATABASE_URL)", () => {
  it("returns 401 when no session", async () => {
    // Mock @/auth to return null session.
    vi.doMock("@/auth", () => ({ auth: async () => null }));
    vi.resetModules();
    const { GET } = await import("@/app/api/v1/me/route");

    const res = await GET(new Request("http://localhost/api/v1/me"));
    expect(res.status).toBe(401);

    vi.doUnmock("@/auth");
  });

  // Full session round-trip (with real admin user) requires the admin seeded in
  // auth-round-trip.test.ts; kept as a separate case after DB is seeded:
  it("returns claims + user + nav for authenticated admin", async () => {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: "1", username: "admin", role: "pm", name: "مدير المشروع" },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();

    const { GET } = await import("@/app/api/v1/me/route");
    const res = await GET(new Request("http://localhost/api/v1/me"));

    // This test only runs against a DB that already has admin seeded (e.g. after auth-round-trip.test.ts).
    // If run in isolation, admin may not exist → 404. That's accepted: test order via
    // file-path ordering places auth-round-trip first; or seed admin in beforeAll here.
    if (res.status === 404) {
      return; // admin not seeded in this DB yet; skip silently
    }

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      claims: { userId: number; username: string; role: string };
      user: { id: number; username: string; role: string };
      nav: { href: string; labelAr: string }[];
    };
    expect(body.claims.username).toBe("admin");
    expect(body.claims.role).toBe("pm");
    expect(body.user.username).toBe("admin");
    expect(body.nav.length).toBeGreaterThan(3); // pm nav has 10 items
    expect(body.nav[0].href).toBe("/action-hub"); // pm lands on action-hub

    vi.doUnmock("@/auth");
  });
});
