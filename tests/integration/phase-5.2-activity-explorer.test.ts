import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 5.2 — Activity Explorer integration tests.
//
// Coverage:
//   T-ACT-PERM-PM, T-ACT-PERM-GM, T-ACT-PERM-MANAGER (200s)
//   T-ACT-PERM-SELLER, T-ACT-PERM-DRIVER, T-ACT-PERM-SK (403s)
//   T-ACT-FILTER-ENTITY-TYPE
//   T-ACT-FILTER-ACTION
//   T-ACT-FILTER-USER-ID (pm viewing any user)
//   T-ACT-FILTER-DATE-RANGE
//   T-ACT-PAGINATION-BOUNDARIES
//   T-ACT-MANAGER-SEES-SELF-AND-TEAM
//   T-ACT-MANAGER-CANT-SEE-OTHER-TEAM
//   T-ACT-MANAGER-USER-ID-FILTER-OUTSIDE-TEAM
//   T-ACT-ORDER-DESC-BY-ID
//   T-ACT-CHAIN-INTACT-AFTER-READS

describe.skipIf(!HAS_DB)(
  "Phase 5.2 — activity explorer (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let stockKeeperId: number;
    let managerAId: number;
    let managerBId: number;
    let driverAId: number;
    let driverBId: number;

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
      const { users } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-5.2");

      // Two separate manager teams — A and B — to prove manager scoping
      // excludes other teams (T-ACT-MANAGER-CANT-SEE-OTHER-TEAM).
      const teamA = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "52a",
          driverSuffixes: ["52a"],
          passwordHash: hash,
        }),
      );
      managerAId = teamA.managerId;
      driverAId = teamA.driverIds[0];

      const teamB = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "52b",
          driverSuffixes: ["52b"],
          passwordHash: hash,
        }),
      );
      managerBId = teamB.managerId;
      driverBId = teamB.driverIds[0];

      [sellerId, stockKeeperId] = await withTxInRoute(
        undefined,
        async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-52a",
              password: hash,
              name: "Seller 52a",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-52a",
              password: hash,
              name: "SK 52a",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          return [s[0].id, sk[0].id];
        },
      );

      // Seed a variety of activity_log rows via the real logActivity helper
      // so the hash-chain stays intact (tested at the end).
      const { logActivity } = await import("@/lib/activity-log");

      // Admin (pm) actions
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "create",
          entityType: "orders",
          entityId: 1001,
          entityRefCode: "ORD-20260423-00001",
          userId: adminUserId,
          username: "admin",
        }),
      );
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "confirm",
          entityType: "deliveries",
          entityId: 2001,
          entityRefCode: "DL-20260423-00001",
          userId: adminUserId,
          username: "admin",
        }),
      );
      // Manager-A actions (self + team driver-A)
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "update",
          entityType: "orders",
          entityId: 1002,
          entityRefCode: "ORD-20260423-00002",
          userId: managerAId,
          username: "mgr-52a",
        }),
      );
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "collect",
          entityType: "payments",
          entityId: 3001,
          entityRefCode: null,
          userId: driverAId,
          username: "drv-52a",
        }),
      );
      // Manager-B actions (other team — manager-A must NOT see these)
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "update",
          entityType: "orders",
          entityId: 1003,
          entityRefCode: "ORD-20260423-00003",
          userId: managerBId,
          username: "mgr-52b",
        }),
      );
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "collect",
          entityType: "payments",
          entityId: 3002,
          entityRefCode: null,
          userId: driverBId,
          username: "drv-52b",
        }),
      );
      // Seller activity (pm/gm see it; managers do NOT — sellers are never
      // team-linked via users.manager_id in schema reality).
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "create",
          entityType: "clients",
          entityId: 4001,
          entityRefCode: null,
          userId: sellerId,
          username: "sel-52a",
        }),
      );
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

    async function freshRoute(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return await import("@/app/api/v1/activity/route");
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const gm = () => ({
      id: adminUserId, // same admin row, just presented as gm via mock
      username: "admin",
      role: "gm",
      name: "GM",
    });
    const managerA = () => ({
      id: managerAId,
      username: "mgr-52a",
      role: "manager",
      name: "Manager A",
    });
    const seller = () => ({
      id: sellerId,
      username: "sel-52a",
      role: "seller",
      name: "Seller A",
    });
    const driverA = () => ({
      id: driverAId,
      username: "drv-52a",
      role: "driver",
      name: "Driver A",
    });
    const stockKeeper = () => ({
      id: stockKeeperId,
      username: "sk-52a",
      role: "stock_keeper",
      name: "SK A",
    });
    async function getList(
      user: ReturnType<typeof admin>,
      qs = "",
    ): Promise<{ status: number; body: unknown }> {
      const mod = await freshRoute(user);
      const url = qs ? `http://localhost/api/v1/activity?${qs}` : `http://localhost/api/v1/activity`;
      const res = await mod.GET(new Request(url));
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }

    it("T-ACT-PERM-PM: GET 200 + full visibility", async () => {
      const r = await getList(admin());
      expect(r.status).toBe(200);
      const body = r.body as { total: number };
      expect(body.total).toBeGreaterThanOrEqual(7);
    });

    it("T-ACT-PERM-GM: GET 200 + full visibility", async () => {
      const r = await getList(gm());
      expect(r.status).toBe(200);
      const body = r.body as { total: number };
      expect(body.total).toBeGreaterThanOrEqual(7);
    });

    it("T-ACT-PERM-MANAGER: GET 200 + team-scoped", async () => {
      const r = await getList(managerA());
      expect(r.status).toBe(200);
      const body = r.body as {
        items: Array<{ userId: number | null }>;
        total: number;
      };
      // Manager-A sees only rows from managerA + driverA.
      for (const it of body.items) {
        expect([managerAId, driverAId]).toContain(it.userId);
      }
      expect(body.total).toBe(2);
    });

    it("T-ACT-PERM-SELLER: GET 403 FORBIDDEN", async () => {
      const r = await getList(seller());
      expect(r.status).toBe(403);
    });

    it("T-ACT-PERM-DRIVER: GET 403 FORBIDDEN", async () => {
      const r = await getList(driverA());
      expect(r.status).toBe(403);
    });

    it("T-ACT-PERM-STOCK-KEEPER: GET 403 FORBIDDEN", async () => {
      const r = await getList(stockKeeper());
      expect(r.status).toBe(403);
    });

    it("T-ACT-FILTER-ENTITY-TYPE: pm filter entityType=orders returns only orders rows", async () => {
      const r = await getList(admin(), "entityType=orders");
      expect(r.status).toBe(200);
      const body = r.body as { items: Array<{ entityType: string }> };
      expect(body.items.length).toBeGreaterThan(0);
      for (const it of body.items) expect(it.entityType).toBe("orders");
    });

    it("T-ACT-FILTER-ACTION: pm filter action=confirm returns only confirm rows", async () => {
      const r = await getList(admin(), "action=confirm");
      expect(r.status).toBe(200);
      const body = r.body as { items: Array<{ action: string }> };
      expect(body.items.length).toBeGreaterThan(0);
      for (const it of body.items) expect(it.action).toBe("confirm");
    });

    it("T-ACT-FILTER-USER-ID: pm filter userId=seller returns only seller rows", async () => {
      const r = await getList(admin(), `userId=${sellerId}`);
      expect(r.status).toBe(200);
      const body = r.body as { items: Array<{ userId: number | null }> };
      expect(body.items.length).toBeGreaterThan(0);
      for (const it of body.items) expect(it.userId).toBe(sellerId);
    });

    it("T-ACT-FILTER-DATE-RANGE: date window excludes outside rows", async () => {
      // dateFrom tomorrow → zero rows (all seeded today Paris).
      const tomorrow = new Date(Date.now() + 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const r = await getList(admin(), `dateFrom=${tomorrow}`);
      expect(r.status).toBe(200);
      const body = r.body as { total: number };
      expect(body.total).toBe(0);
    });

    it("T-ACT-PAGINATION-BOUNDARIES: limit=2 + offset=0 returns 2 items with correct total", async () => {
      const r = await getList(admin(), "limit=2&offset=0");
      expect(r.status).toBe(200);
      const body = r.body as {
        items: unknown[];
        total: number;
        limit: number;
        offset: number;
      };
      expect(body.items.length).toBe(2);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(0);
      expect(body.total).toBeGreaterThanOrEqual(7);
    });

    it("T-ACT-MANAGER-SEES-SELF-AND-TEAM: manager-A sees managerA + driverA rows, not managerB/driverB/seller", async () => {
      const r = await getList(managerA());
      expect(r.status).toBe(200);
      const body = r.body as { items: Array<{ userId: number | null }> };
      const ids = new Set(body.items.map((it) => it.userId));
      expect(ids.has(managerAId)).toBe(true);
      expect(ids.has(driverAId)).toBe(true);
      expect(ids.has(managerBId)).toBe(false);
      expect(ids.has(driverBId)).toBe(false);
      expect(ids.has(sellerId)).toBe(false);
      expect(ids.has(adminUserId)).toBe(false);
    });

    it("T-ACT-MANAGER-CANT-SEE-OTHER-TEAM: explicit userId=driverB returns 0 (not 403)", async () => {
      const r = await getList(managerA(), `userId=${driverBId}`);
      expect(r.status).toBe(200); // no oracle
      const body = r.body as { items: unknown[]; total: number };
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("T-ACT-MANAGER-USER-ID-FILTER-INSIDE-TEAM: explicit userId=driverA returns only driverA", async () => {
      const r = await getList(managerA(), `userId=${driverAId}`);
      expect(r.status).toBe(200);
      const body = r.body as { items: Array<{ userId: number | null }> };
      expect(body.items.length).toBeGreaterThan(0);
      for (const it of body.items) expect(it.userId).toBe(driverAId);
    });

    it("T-ACT-ORDER-DESC-BY-ID: items are sorted newest-first by id", async () => {
      const r = await getList(admin());
      expect(r.status).toBe(200);
      const body = r.body as { items: Array<{ id: number }> };
      for (let i = 1; i < body.items.length; i++) {
        expect(body.items[i - 1].id).toBeGreaterThan(body.items[i].id);
      }
    });

    it("T-ACT-CHAIN-INTACT-AFTER-READS: verifyActivityLogChain returns null after reads", async () => {
      const { withTxInRoute } = await import("@/db/client");
      const { verifyActivityLogChain } = await import("@/lib/activity-log");
      // Issue a read first to make sure the tests' GETs haven't disturbed the chain.
      await getList(admin());
      await getList(managerA());
      const corrupt = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(corrupt).toBeNull();
    });

    // silence-unused guard for inArray referenced in future extensions
    void (() => ({ _inArray: inArray, _and: and }));
  },
);
