import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Integration tests for /api/v1/settings — GET + PUT + D-35 readiness.
// Phase 2c: minimal coverage. SKIPPED without TEST_DATABASE_URL.

describe.skipIf(!HAS_DB)(
  "/api/v1/settings — GET/PUT + D-35 readiness (requires TEST_DATABASE_URL)",
  () => {
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

    async function freshRoute(): Promise<{
      GET: typeof import("@/app/api/v1/settings/route")["GET"];
      PUT: typeof import("@/app/api/v1/settings/route")["PUT"];
    }> {
      vi.resetModules();
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();
      withAdminSession();
      return await import("@/app/api/v1/settings/route");
    }

    it("GET returns settings map + readiness flag (initially not ready)", async () => {
      const { GET } = await freshRoute();
      const res = await GET(new Request("http://localhost/api/v1/settings"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        settings: Record<string, string>;
        invoiceReadiness: { ready: boolean; missing: string[] };
      };
      // Every canonical key should be present with "" default.
      expect(body.settings.shop_iban).toBeDefined();
      expect(body.invoiceReadiness.ready).toBe(false);
      expect(body.invoiceReadiness.missing).toContain("shop_iban");
    });

    it("PUT with unknown key returns validation error", async () => {
      const { PUT } = await freshRoute();
      const res = await PUT(
        new Request("http://localhost/api/v1/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ made_up_key: "value" }),
        }),
      );
      expect([400, 422]).toContain(res.status);
    });

    it("PUT upserts D-35 mandatory mentions → readiness becomes true", async () => {
      const { PUT } = await freshRoute();
      const res = await PUT(
        new Request("http://localhost/api/v1/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shop_iban: "FR7612345678901234567890123",
            shop_bic: "AGRIFRPP123",
            shop_capital_social: "10000",
            shop_rcs_number: "123456789",
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        invoiceReadiness: { ready: boolean; missing: string[] };
      };
      expect(body.invoiceReadiness.ready).toBe(true);
      expect(body.invoiceReadiness.missing).toEqual([]);
    });

    it("Seller GET returns 403 (settings are pm/gm only)", async () => {
      vi.resetModules();
      vi.doMock("@/auth", () => ({
        auth: async () => ({
          user: { id: "99", username: "s1", role: "seller", name: "Seller" },
        }),
      }));
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();

      const { GET } = await import("@/app/api/v1/settings/route");
      const res = await GET(new Request("http://localhost/api/v1/settings"));
      expect(res.status).toBe(403);
    });

    it("Manager GET returns 403 (settings are pm/gm only — strict)", async () => {
      vi.resetModules();
      vi.doMock("@/auth", () => ({
        auth: async () => ({
          user: { id: "99", username: "m1", role: "manager", name: "Manager" },
        }),
      }));
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();

      const { GET } = await import("@/app/api/v1/settings/route");
      const res = await GET(new Request("http://localhost/api/v1/settings"));
      expect(res.status).toBe(403);
    });
  },
);
