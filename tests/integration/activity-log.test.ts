import { beforeAll, describe, expect, it } from "vitest";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// D-80: activity_log hash-chain end-to-end. Writes multiple entries and verifies
// chain integrity via verifyActivityLogChain(). Skip without TEST_DATABASE_URL.

describe.skipIf(!HAS_DB)("D-80 activity_log hash-chain (requires TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    await resetSchema();
    await applyMigrations();
  });

  it("writes a single first row with prev_hash = NULL", async () => {
    const { withTxInRoute } = await import("@/db/client");
    const { logActivity, verifyActivityLogChain } = await import("@/lib/activity-log");

    await withTxInRoute(undefined, async (tx) => {
      await logActivity(tx, {
        action: "create",
        entityType: "orders",
        entityId: 1,
        username: "admin",
        details: { test: "first" },
      });
    });

    const corruptId = await withTxInRoute(undefined, (tx) => verifyActivityLogChain(tx));
    expect(corruptId).toBeNull();

    // Verify prev_hash is NULL on the first row.
    const { sql } = await import("drizzle-orm");
    const row = await withTxInRoute(undefined, async (tx) => {
      const r = await tx.execute(
        sql`SELECT prev_hash FROM activity_log ORDER BY id ASC LIMIT 1`,
      );
      return (r as unknown as { rows?: Array<{ prev_hash: string | null }> }).rows?.[0];
    });
    expect(row?.prev_hash).toBeNull();
  });

  it("chains subsequent rows: row_n.prev_hash === row_{n-1}.row_hash", async () => {
    const { withTxInRoute } = await import("@/db/client");
    const { logActivity, verifyActivityLogChain } = await import("@/lib/activity-log");

    for (let i = 0; i < 5; i++) {
      await withTxInRoute(undefined, async (tx) => {
        await logActivity(tx, {
          action: "update",
          entityType: "orders",
          entityId: 1,
          username: `user${i}`,
          details: { iteration: i },
        });
      });
    }

    const corruptId = await withTxInRoute(undefined, (tx) => verifyActivityLogChain(tx));
    expect(corruptId).toBeNull();

    // Verify by reading raw rows.
    const { sql } = await import("drizzle-orm");
    const all = await withTxInRoute(undefined, async (tx) => {
      const r = await tx.execute(
        sql`SELECT id, prev_hash, row_hash FROM activity_log ORDER BY id ASC`,
      );
      return (r as unknown as { rows?: Array<{ id: number; prev_hash: string | null; row_hash: string }> }).rows ?? [];
    });
    expect(all.length).toBeGreaterThan(1);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].prev_hash).toBe(all[i - 1].row_hash);
    }
  });

  it("verifyActivityLogChain flags tampering", async () => {
    const { withTxInRoute } = await import("@/db/client");
    const { verifyActivityLogChain } = await import("@/lib/activity-log");
    const { sql } = await import("drizzle-orm");

    // Note: activity_log has BEFORE UPDATE trigger that rejects updates (D-58).
    // Use a raw DELETE-then-INSERT pattern isn't possible either. So to simulate
    // tampering we disable the trigger, corrupt, then re-enable + verify, then
    // roll back so later tests aren't polluted.
    await withTxInRoute(undefined, async (tx) => {
      await tx.execute(sql`ALTER TABLE activity_log DISABLE TRIGGER activity_log_no_update`);
      await tx.execute(sql`UPDATE activity_log SET details = '{"tampered":true}' WHERE id = (SELECT MIN(id) FROM activity_log)`);

      const corruptId = await verifyActivityLogChain(tx);
      expect(corruptId).not.toBeNull();

      // ROLLBACK via throwing — but we want to keep the re-enable trigger.
      // Simpler: re-enable + restore before returning.
      await tx.execute(sql`ALTER TABLE activity_log ENABLE TRIGGER activity_log_no_update`);
      throw new Error("rollback marker");
    }).catch((e: Error) => {
      if (e.message !== "rollback marker") throw e;
    });

    // Re-enable trigger outside the rolled-back tx (idempotent).
    await withTxInRoute(undefined, async (tx) => {
      await tx.execute(sql`ALTER TABLE activity_log ENABLE TRIGGER activity_log_no_update`);
    });

    const corruptIdAfter = await withTxInRoute(undefined, (tx) => verifyActivityLogChain(tx));
    expect(corruptIdAfter).toBeNull();
  });
});
