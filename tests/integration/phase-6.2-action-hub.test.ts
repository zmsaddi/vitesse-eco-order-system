import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 6.2 — Action Hub integration tests.
//
// Coverage groups per the accepted Implementation Contract §6.a:
//   T-AH-AUTH-*    authorization matrix (7)
//   T-AH-URG-*     urgent-action counts — one triggering seed per type (7)
//   T-AH-ACT-*     recent activity list (3)
//   T-AH-CNT-*     team counts (4)
//   T-AH-NAV-*     role-home page redirect (4 → exercised via permission code)
//   T-AH-INV-*     invariants + regression (4)

describe.skipIf(!HAS_DB)(
  "Phase 6.2 — Action Hub (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let stockKeeperId: number;
    let managerAId: number;
    let managerBId: number;
    let driverAId: number;
    let clientAId: number;

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
      const {
        users,
        clients,
        products,
        orders,
        payments,
        userBonusRates,
        settings,
      } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");
      const { logActivity } = await import("@/lib/activity-log");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-6.2");

      const teamA = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "62a",
          driverSuffixes: ["62a"],
          passwordHash: hash,
        }),
      );
      managerAId = teamA.managerId;
      driverAId = teamA.driverIds[0];

      const teamB = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "62b",
          driverSuffixes: ["62b"],
          passwordHash: hash,
        }),
      );
      managerBId = teamB.managerId;

      [sellerId, stockKeeperId] = await withTxInRoute(
        undefined,
        async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-62a",
              password: hash,
              name: "Seller 62a",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-62a",
              password: hash,
              name: "SK 62a",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          return [s[0].id, sk[0].id];
        },
      );

      clientAId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(clients)
            .values({
              name: "عميل 6.2",
              phone: "+33600620001",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      await withTxInRoute(undefined, (tx) =>
        tx
          .insert(products)
          .values({
            name: "منتج 6.2",
            category: "cat-62",
            buyPrice: "40.00",
            sellPrice: "100.00",
            stock: "1.00", // below default threshold (3) → triggers low-stock
            lowStockThreshold: 3,
            createdBy: "admin",
          }),
      );

      // Seed: 2 overdue orders (10 days old, unpaid), 1 recent paid order,
      // 1 stale bonus snapshot (100 d old), 1 incomplete D-35 setting.
      const today = new Date().toISOString().slice(0, 10);
      const tenDaysAgoIso = new Date(Date.now() - 10 * 24 * 3600_000)
        .toISOString()
        .slice(0, 10);

      // Overdue order A (unpaid, admin-created)
      await withTxInRoute(undefined, (tx) =>
        tx.insert(orders).values({
          refCode: "ORD-62OVA",
          date: tenDaysAgoIso,
          clientId: clientAId,
          clientNameCached: "عميل 6.2",
          status: "محجوز",
          paymentMethod: "آجل",
          paymentStatus: "pending",
          totalAmount: "100.00",
          advancePaid: "0.00",
          createdBy: "admin",
        }),
      );

      // Overdue order B (unpaid, team-A manager-created)
      await withTxInRoute(undefined, (tx) =>
        tx.insert(orders).values({
          refCode: "ORD-62OVB",
          date: tenDaysAgoIso,
          clientId: clientAId,
          clientNameCached: "عميل 6.2",
          status: "محجوز",
          paymentMethod: "آجل",
          paymentStatus: "pending",
          totalAmount: "200.00",
          advancePaid: "0.00",
          createdBy: "mgr-62a",
        }),
      );

      // Recent (not overdue) paid order — should NOT count as overdue
      const [recentOrder] = await withTxInRoute(undefined, (tx) =>
        tx
          .insert(orders)
          .values({
            refCode: "ORD-62NEW",
            date: today,
            clientId: clientAId,
            clientNameCached: "عميل 6.2",
            status: "مؤكد",
            paymentMethod: "كاش",
            paymentStatus: "paid",
            totalAmount: "50.00",
            advancePaid: "50.00",
            createdBy: "admin",
          })
          .returning(),
      );
      await withTxInRoute(undefined, (tx) =>
        tx.insert(payments).values({
          orderId: recentOrder.id,
          clientId: clientAId,
          clientNameCached: "عميل 6.2",
          date: today,
          type: "collection",
          amount: "50.00",
          paymentMethod: "كاش",
          createdBy: "admin",
        }),
      );

      // Stale bonus snapshot — 100 d old → flagged as stale (> 60)
      await withTxInRoute(undefined, (tx) =>
        tx.insert(userBonusRates).values({
          username: "mgr-62a",
          sellerFixed: "10.00",
          updatedBy: "admin",
          updatedAt: sql`NOW() - INTERVAL '100 days'`,
        }),
      );

      // Fresh bonus snapshot — 10 d old → NOT flagged
      await withTxInRoute(undefined, (tx) =>
        tx.insert(userBonusRates).values({
          username: "admin",
          sellerFixed: "12.00",
          updatedBy: "admin",
          updatedAt: sql`NOW() - INTERVAL '10 days'`,
        }),
      );

      // Clear one D-35 required setting to trigger incompleteSettings > 0.
      // /api/init seeds most shop_* keys with real values; we blank shop_iban
      // (already empty by default in SETTINGS_SEED, but re-assert to be safe).
      await withTxInRoute(undefined, (tx) =>
        tx
          .update(settings)
          .set({ value: "" })
          .where(eq(settings.key, "shop_iban")),
      );

      // A couple of activity rows, admin + team-A scope
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "create",
          entityType: "orders",
          entityId: recentOrder.id,
          entityRefCode: "ORD-62NEW",
          userId: adminUserId,
          username: "admin",
        }),
      );
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "create",
          entityType: "orders",
          entityId: recentOrder.id,
          entityRefCode: "ORD-62NEW",
          userId: driverAId,
          username: "drv-62a",
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
      return await import("@/app/api/v1/action-hub/route");
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const gm = () => ({
      id: adminUserId,
      username: "admin",
      role: "gm",
      name: "GM",
    });
    const managerA = () => ({
      id: managerAId,
      username: "mgr-62a",
      role: "manager",
      name: "Manager A",
    });
    const managerB = () => ({
      id: managerBId,
      username: "mgr-62b",
      role: "manager",
      name: "Manager B",
    });
    const seller = () => ({
      id: sellerId,
      username: "sel-62a",
      role: "seller",
      name: "Seller",
    });
    const driver = () => ({
      id: driverAId,
      username: "drv-62a",
      role: "driver",
      name: "Driver",
    });
    const sk = () => ({
      id: stockKeeperId,
      username: "sk-62a",
      role: "stock_keeper",
      name: "SK",
    });

    async function getActionHub(user: ReturnType<typeof admin>) {
      const mod = await freshRoute(user);
      const res = await mod.GET(
        new Request("http://localhost/api/v1/action-hub"),
      );
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }

    async function getActionHubNoSession() {
      // Mock unauthenticated session (auth returns null)
      vi.resetModules();
      vi.doMock("@/auth", () => ({ auth: async () => null }));
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      const mod = await import("@/app/api/v1/action-hub/route");
      const res = await mod.GET(
        new Request("http://localhost/api/v1/action-hub"),
      );
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }

    // ──────────── Authorization matrix ────────────

    it("T-AH-AUTH-01: unauth → 401", async () => {
      const r = await getActionHubNoSession();
      expect(r.status).toBe(401);
    });

    it("T-AH-AUTH-02: seller → 403", async () => {
      const r = await getActionHub(seller());
      expect(r.status).toBe(403);
    });

    it("T-AH-AUTH-03: driver → 403", async () => {
      const r = await getActionHub(driver());
      expect(r.status).toBe(403);
    });

    it("T-AH-AUTH-04: stock_keeper → 403", async () => {
      const r = await getActionHub(sk());
      expect(r.status).toBe(403);
    });

    it("T-AH-AUTH-05: pm → 200", async () => {
      const r = await getActionHub(admin());
      expect(r.status).toBe(200);
    });

    it("T-AH-AUTH-06: gm → 200", async () => {
      const r = await getActionHub(gm());
      expect(r.status).toBe(200);
    });

    it("T-AH-AUTH-07: manager → 200", async () => {
      const r = await getActionHub(managerA());
      expect(r.status).toBe(200);
    });

    // ──────────── Urgent actions (seed + verify each) ────────────

    it("T-AH-URG-01: pm sees overduePayments = 2", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: { overduePayments: number };
      };
      expect(body.urgentActions.overduePayments).toBe(2);
    });

    it("T-AH-URG-02: reconciliationDue ≥ 0 (no positive boxes by default)", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: { reconciliationDue: number };
      };
      expect(body.urgentActions.reconciliationDue).toBeGreaterThanOrEqual(0);
    });

    it("T-AH-URG-02b: positive-balance manager_box triggers reconciliationDue", async () => {
      const { withTxInRoute } = await import("@/db/client");
      const { treasuryAccounts } = await import("@/db/schema");
      await withTxInRoute(undefined, (tx) =>
        tx
          .update(treasuryAccounts)
          .set({ balance: "500.00" })
          .where(
            eq(treasuryAccounts.ownerUserId, managerAId),
          ),
      );
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: { reconciliationDue: number };
      };
      expect(body.urgentActions.reconciliationDue).toBeGreaterThanOrEqual(1);
      // Clean up for subsequent tests
      await withTxInRoute(undefined, (tx) =>
        tx
          .update(treasuryAccounts)
          .set({ balance: "0.00" })
          .where(eq(treasuryAccounts.ownerUserId, managerAId)),
      );
    });

    it("T-AH-URG-03: pendingCancellations counts today's cancelled orders", async () => {
      // Seed an order dated today with status='ملغي' (matches loadCounts query).
      const { withTxInRoute } = await import("@/db/client");
      const { orders } = await import("@/db/schema");
      const today = new Date().toISOString().slice(0, 10);
      const [cancOrder] = await withTxInRoute(undefined, (tx) =>
        tx
          .insert(orders)
          .values({
            refCode: "ORD-62CANC",
            date: today,
            clientId: clientAId,
            clientNameCached: "عميل 6.2",
            status: "ملغي",
            paymentMethod: "كاش",
            paymentStatus: "pending",
            totalAmount: "10.00",
            advancePaid: "0.00",
            createdBy: "admin",
          })
          .returning(),
      );
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: { pendingCancellations: number };
      };
      expect(body.urgentActions.pendingCancellations).toBeGreaterThanOrEqual(1);
      // cleanup — soft-delete so the row doesn't leak into subsequent tests
      await withTxInRoute(undefined, (tx) =>
        tx
          .update(orders)
          .set({ deletedAt: new Date() })
          .where(eq(orders.id, cancOrder.id)),
      );
    });

    it("T-AH-URG-04: stale bonus snapshot > 60 d is flagged", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: { staleSnapshots: number };
      };
      // Seeded: one row at 100d old → stale, one at 10d old → fresh.
      expect(body.urgentActions.staleSnapshots).toBeGreaterThanOrEqual(1);
    });

    it("T-AH-URG-05: lowStock >= 1 (seeded product stock=1, threshold=3)", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: { lowStock: number };
      };
      expect(body.urgentActions.lowStock).toBeGreaterThanOrEqual(1);
    });

    it("T-AH-URG-06: incompleteSettings >= 1 (shop_iban blanked)", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: { incompleteSettings: number };
      };
      expect(body.urgentActions.incompleteSettings).toBeGreaterThanOrEqual(1);
    });

    it("T-AH-URG-07: total = sum of six components", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: {
          overduePayments: number;
          reconciliationDue: number;
          pendingCancellations: number;
          staleSnapshots: number;
          lowStock: number;
          incompleteSettings: number;
          total: number;
        };
      };
      const ua = body.urgentActions;
      expect(ua.total).toBe(
        ua.overduePayments +
          ua.reconciliationDue +
          ua.pendingCancellations +
          ua.staleSnapshots +
          ua.lowStock +
          ua.incompleteSettings,
      );
    });

    // ──────────── Recent activity ────────────

    it("T-AH-ACT-01: response holds ≤ 5 rows", async () => {
      const r = await getActionHub(admin());
      const body = r.body as { recentActivity: unknown[] };
      expect(body.recentActivity.length).toBeLessThanOrEqual(5);
    });

    it("T-AH-ACT-02: rows ordered timestamp DESC", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        recentActivity: Array<{ timestamp: string }>;
      };
      for (let i = 1; i < body.recentActivity.length; i++) {
        const prev = new Date(body.recentActivity[i - 1].timestamp).getTime();
        const cur = new Date(body.recentActivity[i].timestamp).getTime();
        expect(prev).toBeGreaterThanOrEqual(cur);
      }
    });

    it("T-AH-ACT-03: manager B sees zero team-A activity (team scope)", async () => {
      const r = await getActionHub(managerB());
      const body = r.body as {
        recentActivity: Array<{ username: string }>;
      };
      // Manager B's team does not include 'admin' or 'drv-62a'
      for (const row of body.recentActivity) {
        expect(["mgr-62b", "drv-62b"]).toContain(row.username);
      }
    });

    // ──────────── Team counts ────────────

    it("T-AH-CNT-01: ordersToday >= 1 (seeded recent paid order)", async () => {
      const r = await getActionHub(admin());
      const body = r.body as { teamCounts: { ordersToday: number } };
      expect(body.teamCounts.ordersToday).toBeGreaterThanOrEqual(1);
    });

    it("T-AH-CNT-02: deliveriesPending number is a non-negative integer", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        teamCounts: { deliveriesPending: number };
      };
      expect(body.teamCounts.deliveriesPending).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(body.teamCounts.deliveriesPending)).toBe(true);
    });

    it("T-AH-CNT-03: teamCounts.lowStockCount === urgentActions.lowStock", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        teamCounts: { lowStockCount: number };
        urgentActions: { lowStock: number };
      };
      expect(body.teamCounts.lowStockCount).toBe(body.urgentActions.lowStock);
    });

    it("T-AH-CNT-04: teamCounts.openCancellations === urgentActions.pendingCancellations", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        teamCounts: { openCancellations: number };
        urgentActions: { pendingCancellations: number };
      };
      expect(body.teamCounts.openCancellations).toBe(
        body.urgentActions.pendingCancellations,
      );
    });

    // ──────────── Scope semantics ────────────

    it("T-AH-SCOPE-PM-GLOBAL: scope = 'global' for pm", async () => {
      const r = await getActionHub(admin());
      const body = r.body as { scope: string };
      expect(body.scope).toBe("global");
    });

    it("T-AH-SCOPE-GM-GLOBAL: scope = 'global' for gm", async () => {
      const r = await getActionHub(gm());
      const body = r.body as { scope: string };
      expect(body.scope).toBe("global");
    });

    it("T-AH-SCOPE-MANAGER-TEAM: scope = 'team' for manager", async () => {
      const r = await getActionHub(managerA());
      const body = r.body as { scope: string };
      expect(body.scope).toBe("team");
    });

    it("T-AH-SCOPE-MANAGER-OVERDUE-TEAM-ONLY: manager-A sees team's overdue only", async () => {
      const r = await getActionHub(managerA());
      const body = r.body as {
        urgentActions: { overduePayments: number };
      };
      // Team-A includes mgr-62a + drv-62a. One overdue order by mgr-62a
      // (200€ unpaid). The admin-created overdue is NOT in team.
      expect(body.urgentActions.overduePayments).toBe(1);
    });

    // ──────────── Invariants + regression ────────────

    it("T-AH-INV-01: verifyActivityLogChain is null before and after reads", async () => {
      const { withTxInRoute } = await import("@/db/client");
      const { verifyActivityLogChain } = await import("@/lib/activity-log");
      const before = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(before).toBeNull();
      await getActionHub(admin());
      await getActionHub(managerA());
      const after = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(after).toBeNull();
    });

    it("T-AH-INV-02: urgentActions never negative, keys all present", async () => {
      const r = await getActionHub(admin());
      const body = r.body as {
        urgentActions: Record<string, number>;
      };
      const keys = [
        "overduePayments",
        "reconciliationDue",
        "pendingCancellations",
        "staleSnapshots",
        "lowStock",
        "incompleteSettings",
        "total",
      ];
      for (const k of keys) {
        expect(typeof body.urgentActions[k]).toBe("number");
        expect(body.urgentActions[k]).toBeGreaterThanOrEqual(0);
      }
    });

    it("T-AH-INV-03: response validates against ActionHubResponse Zod schema", async () => {
      const { ActionHubResponse } = await import(
        "@/modules/action-hub/dto"
      );
      const r = await getActionHub(admin());
      const parsed = ActionHubResponse.safeParse(r.body);
      if (!parsed.success) {
        // Surface the Zod issues for easier debug
        throw new Error(JSON.stringify(parsed.error.flatten().fieldErrors));
      }
      expect(parsed.success).toBe(true);
    });

    it("T-AH-INV-04: recentActivity rows conform to RecentActivityRowDto", async () => {
      const { RecentActivityRowDto } = await import(
        "@/modules/action-hub/dto"
      );
      const r = await getActionHub(admin());
      const body = r.body as { recentActivity: unknown[] };
      for (const row of body.recentActivity) {
        const parsed = RecentActivityRowDto.safeParse(row);
        expect(parsed.success).toBe(true);
      }
    });

    it("T-AH-INV-STALE-MARKERS: no '(Phase N)' or 'Vitesse Eco — Phase X' in UI source", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const root = path.resolve(process.cwd(), "src/app");
      const visited: string[] = [];
      (function walk(dir: string) {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            walk(full);
          } else if (full.endsWith(".tsx")) {
            visited.push(full);
          }
        }
      })(root);
      const re = /\(Phase\s*[0-9]+\)|Vitesse Eco — Phase|المرحلة\s*[0-9]\s*—/;
      const offenders: string[] = [];
      for (const file of visited) {
        const content = fs.readFileSync(file, "utf8");
        const stripped = content
          // Drop // line comments and /* ... */ block comments (markers are
          // allowed inside source comments — the guard is UI-level only).
          .replace(/\/\/[^\n]*/g, "")
          .replace(/\/\*[\s\S]*?\*\//g, "");
        if (re.test(stripped)) offenders.push(file);
      }
      if (offenders.length > 0) {
        throw new Error("Stale Phase markers remain in UI: " + offenders.join(", "));
      }
      expect(offenders).toEqual([]);
    });

    it("T-AH-INV-05: Zod rejects a mutated response (regression guard)", async () => {
      const { ActionHubResponse } = await import(
        "@/modules/action-hub/dto"
      );
      const invalid = { scope: "bogus", urgentActions: {}, recentActivity: [], teamCounts: {} };
      const parsed = ActionHubResponse.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  },
);
