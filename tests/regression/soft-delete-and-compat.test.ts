import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, isNotNull } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
} from "../integration/setup";

// P-audit-1 — Real regression pack, file 3/3.
//
// Flow 09 — soft-delete invariant. No HTTP DELETE endpoint exists for
// orders in the current codebase (amendment A1 vs original contract §0
// plan); this regression guards the D-82 invariant directly by seeding a
// soft-deleted orders row and asserting:
//   SD-01: GET /api/v1/orders list excludes it by default.
//   SD-02: the physical row still exists (deletedAt non-null, not hard-deleted).

describe.skipIf(!HAS_DB)(
  "P-audit-1 soft-delete invariant (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let clientId: number;
    let softDeletedOrderId = 0;
    let liveOrderId = 0;

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.NEXTAUTH_SECRET =
        process.env.NEXTAUTH_SECRET ??
        "test-secret-at-least-32-characters-long!!";
      delete process.env.INIT_BOOTSTRAP_SECRET;
      await resetSchema();
      await applyMigrations();

      vi.resetModules();
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();
      const { POST: initPost } = await import("@/app/api/init/route");
      await initPost(
        new Request("http://localhost/api/init", { method: "POST" }) as never,
      );

      const { withRead, withTxInRoute } = await import("@/db/client");
      const { users, clients, orders } = await import("@/db/schema");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      clientId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(clients)
            .values({
              name: "عميل PA1-SD",
              phone: "+33600000090",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      // Seed one live order + one soft-deleted order directly.
      const today = new Date().toISOString().slice(0, 10);

      const liveRows = await withTxInRoute(undefined, (tx) =>
        tx
          .insert(orders)
          .values({
            refCode: "ORD-PA1-LIVE",
            date: today,
            clientId,
            clientNameCached: "عميل PA1-SD",
            status: "محجوز",
            paymentMethod: "كاش",
            paymentStatus: "pending",
            totalAmount: "10.00",
            advancePaid: "0.00",
            createdBy: "admin",
          })
          .returning(),
      );
      liveOrderId = liveRows[0].id;

      const softRows = await withTxInRoute(undefined, (tx) =>
        tx
          .insert(orders)
          .values({
            refCode: "ORD-PA1-SOFT",
            date: today,
            clientId,
            clientNameCached: "عميل PA1-SD",
            status: "محجوز",
            paymentMethod: "كاش",
            paymentStatus: "pending",
            totalAmount: "20.00",
            advancePaid: "0.00",
            createdBy: "admin",
            deletedAt: new Date(),
            deletedBy: "admin",
          })
          .returning(),
      );
      softDeletedOrderId = softRows[0].id;
    });

    function mockSession(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.doMock("@/auth", () => ({
        auth: async () => ({
          user: {
            id: String(user.id),
            username: user.username,
            role: user.role,
            name: user.name,
          },
          expires: new Date(Date.now() + 3600_000).toISOString(),
        }),
      }));
    }

    async function fresh(
      module: string,
      user: { id: number; username: string; role: string; name: string },
    ) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return await import(module);
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });

    it("T-PA1-SD-01: GET /api/v1/orders/[id] for the soft-deleted row → 404 (filter invariant)", async () => {
      // No GET list endpoint at /api/v1/orders in the current codebase.
      // The D-82 filter invariant is guarded by the detail endpoint:
      // getOrderById filters `isNull(deletedAt)` so a soft-deleted order is
      // opaque to HTTP callers. Implementation amendment vs contract §0
      // plan — documented in the delivery report §12. Live row still
      // fetchable; deleted row returns 404.
      const mod = await fresh("@/app/api/v1/orders/[id]/route", admin());
      const live = await mod.GET(
        new Request(`http://localhost/api/v1/orders/${liveOrderId}`),
        { params: Promise.resolve({ id: String(liveOrderId) }) },
      );
      expect(live.status).toBe(200);

      const modB = await fresh("@/app/api/v1/orders/[id]/route", admin());
      const soft = await modB.GET(
        new Request(`http://localhost/api/v1/orders/${softDeletedOrderId}`),
        { params: Promise.resolve({ id: String(softDeletedOrderId) }) },
      );
      expect(soft.status).toBe(404);
    });

    it("T-PA1-SD-02: soft-deleted row physically exists (deletedAt non-null, not hard-deleted)", async () => {
      const { withRead } = await import("@/db/client");
      const { orders } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select()
          .from(orders)
          .where(eq(orders.id, softDeletedOrderId)),
      );
      expect(rows.length).toBe(1);
      expect(rows[0].deletedAt).not.toBeNull();

      // Belt: separately confirm that "deleted rows still queryable" by
      // counting rows where deletedAt IS NOT NULL.
      const softCount = await withRead(undefined, (db) =>
        db.select().from(orders).where(isNotNull(orders.deletedAt)),
      );
      expect(softCount.length).toBeGreaterThanOrEqual(1);
    });
  },
);
