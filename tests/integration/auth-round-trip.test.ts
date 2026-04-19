import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Auth round-trip integration — D-67 SessionClaims + D-40 Argon2id + D-12 permissions.
// SKIPPED when TEST_DATABASE_URL not set.

describe.skipIf(!HAS_DB)(
  "Auth round-trip — credentials → claims → can() (requires TEST_DATABASE_URL)",
  () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.NEXTAUTH_SECRET =
        process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
      delete process.env.INIT_BOOTSTRAP_SECRET;
      await resetSchema();
      await applyMigrations();

      // Bootstrap admin via /api/init.
      const { POST } = await import("@/app/api/init/route");
      const req = new Request("http://localhost/api/init", { method: "POST" });
      const res = await POST(req as never);
      if (res.status !== 200) {
        throw new Error(`init failed: ${res.status}`);
      }
    });

    it("admin user exists with Argon2id hash (D-40)", async () => {
      const { withRead } = await import("@/db/client");
      const { users } = await import("@/db/schema");

      const rows = await withRead(undefined, async (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].password).toMatch(/^\$argon2id\$/);
      expect(rows[0].role).toBe("pm");
      expect(rows[0].active).toBe(true);
    });

    it("permissions seeded — pm can view orders", async () => {
      const { can } = await import("@/lib/can");
      await expect(can("pm", "orders", "view")).resolves.toBe(true);
    });

    it("permissions seeded — seller cannot create distributions (default deny)", async () => {
      const { can } = await import("@/lib/can");
      await expect(can("seller", "distributions", "create")).resolves.toBe(false);
    });

    it("D-12: only pm can mutate permissions (gm has view only)", async () => {
      const { can } = await import("@/lib/can");
      await expect(can("pm", "permissions", "edit")).resolves.toBe(true);
      await expect(can("gm", "permissions", "edit")).resolves.toBe(false);
      await expect(can("gm", "permissions", "view")).resolves.toBe(true);
    });

    it("driver can view assigned orders but not create (task-first — D-72)", async () => {
      const { can } = await import("@/lib/can");
      await expect(can("driver", "orders", "view_assigned")).resolves.toBe(true);
      await expect(can("driver", "orders", "create")).resolves.toBe(false);
    });

    it("settings seeded with D-35 placeholders (shop_iban empty)", async () => {
      const { withRead } = await import("@/db/client");
      const { settings } = await import("@/db/schema");

      const rows = await withRead(undefined, async (db) =>
        db.select().from(settings).where(eq(settings.key, "shop_iban")).limit(1),
      );
      expect(rows[0].value).toBe("");
    });
  },
);
