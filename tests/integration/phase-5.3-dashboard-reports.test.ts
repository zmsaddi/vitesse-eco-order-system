import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 5.3 — dashboard + reports integration tests.
//
// Coverage groups:
//   T-DASH-PERM / KPI / COUNTS / TREASURY / DATE-FILTER / MANAGER-SCOPE
//   T-REP-INVALID-SLUG / SLUG-FORBIDDEN / PERM-MATRIX / DATE-FILTER
//   T-REP-PNL / REVENUE-BY-DAY / TOP-CLIENTS / TOP-PRODUCTS /
//     EXPENSES-BY-CATEGORY / BONUSES-BY-USER (+ manager team variant)
//   T-REP-CHAIN-INTACT-AFTER-READS  ← reviewer amendment #4

describe.skipIf(!HAS_DB)(
  "Phase 5.3 — dashboard + reports (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let stockKeeperId: number;
    let managerAId: number;
    let managerBId: number;
    let driverAId: number;
    let driverBId: number;
    let clientAId: number;
    let productAId: number;

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
        orderItems,
        payments,
        expenses,
        bonuses,
        settlements,
      } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");
      const { logActivity } = await import("@/lib/activity-log");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-5.3");

      const teamA = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "53a",
          driverSuffixes: ["53a"],
          passwordHash: hash,
        }),
      );
      managerAId = teamA.managerId;
      driverAId = teamA.driverIds[0];

      const teamB = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "53b",
          driverSuffixes: ["53b"],
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
              username: "sel-53a",
              password: hash,
              name: "Seller 53a",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-53a",
              password: hash,
              name: "SK 53a",
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
              name: "عميل 5.3",
              phone: "+33600530001",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      productAId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(products)
            .values({
              name: "منتج 5.3",
              category: "cat-53",
              buyPrice: "40.00",
              sellPrice: "100.00",
              stock: "10.00",
              lowStockThreshold: 5,
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      // Seed some orders + payments + expenses + bonuses for pnl / revenue /
      // debts tests. Dates are in the current Paris month so default period
      // captures them.
      const today = new Date().toISOString().slice(0, 10);

      // Order A: created by admin, fully paid 100€, confirmed
      const [ordA] = await withTxInRoute(undefined, (tx) =>
        tx
          .insert(orders)
          .values({
            refCode: "ORD-53A",
            date: today,
            clientId: clientAId,
            clientNameCached: "عميل 5.3",
            status: "مؤكد",
            paymentMethod: "كاش",
            paymentStatus: "paid",
            totalAmount: "100.00",
            advancePaid: "100.00",
            confirmationDate: new Date(),
            createdBy: "admin",
          })
          .returning(),
      );
      await withTxInRoute(undefined, (tx) =>
        tx.insert(orderItems).values({
          orderId: ordA.id,
          productId: productAId,
          productNameCached: "منتج 5.3",
          category: "cat-53",
          quantity: "1",
          recommendedPrice: "100.00",
          unitPrice: "100.00",
          costPrice: "40.00",
          lineTotal: "100.00",
          isGift: false,
          commissionRuleSnapshot: {},
        }),
      );
      await withTxInRoute(undefined, (tx) =>
        tx.insert(payments).values({
          orderId: ordA.id,
          clientId: clientAId,
          clientNameCached: "عميل 5.3",
          date: today,
          type: "collection",
          amount: "100.00",
          paymentMethod: "كاش",
          createdBy: "admin",
        }),
      );

      // Order B: created by manager-A, 200€ total, paid 50 (outstanding 150)
      const [ordB] = await withTxInRoute(undefined, (tx) =>
        tx
          .insert(orders)
          .values({
            refCode: "ORD-53B",
            date: today,
            clientId: clientAId,
            clientNameCached: "عميل 5.3",
            status: "مؤكد",
            paymentMethod: "آجل",
            paymentStatus: "partial",
            totalAmount: "200.00",
            advancePaid: "50.00",
            confirmationDate: new Date(),
            createdBy: "mgr-53a",
          })
          .returning(),
      );
      await withTxInRoute(undefined, (tx) =>
        tx.insert(orderItems).values({
          orderId: ordB.id,
          productId: productAId,
          productNameCached: "منتج 5.3",
          category: "cat-53",
          quantity: "2",
          recommendedPrice: "100.00",
          unitPrice: "100.00",
          costPrice: "40.00",
          lineTotal: "200.00",
          isGift: false,
          commissionRuleSnapshot: {},
        }),
      );
      await withTxInRoute(undefined, (tx) =>
        tx.insert(payments).values({
          orderId: ordB.id,
          clientId: clientAId,
          clientNameCached: "عميل 5.3",
          date: today,
          type: "collection",
          amount: "50.00",
          paymentMethod: "آجل",
          createdBy: "mgr-53a",
        }),
      );

      // Order C: created by manager-B (cross-team; manager-A must not see it)
      const [ordC] = await withTxInRoute(undefined, (tx) =>
        tx
          .insert(orders)
          .values({
            refCode: "ORD-53C",
            date: today,
            clientId: clientAId,
            clientNameCached: "عميل 5.3",
            status: "مؤكد",
            paymentMethod: "كاش",
            paymentStatus: "paid",
            totalAmount: "30.00",
            advancePaid: "30.00",
            confirmationDate: new Date(),
            createdBy: "mgr-53b",
          })
          .returning(),
      );
      await withTxInRoute(undefined, (tx) =>
        tx.insert(payments).values({
          orderId: ordC.id,
          clientId: clientAId,
          clientNameCached: "عميل 5.3",
          date: today,
          type: "collection",
          amount: "30.00",
          paymentMethod: "كاش",
          createdBy: "mgr-53b",
        }),
      );

      // Expenses: 25€ rent + 10€ fuel
      await withTxInRoute(undefined, async (tx) => {
        await tx.insert(expenses).values({
          date: today,
          category: "rent",
          description: "إيجار",
          amount: "25.00",
          paymentMethod: "كاش",
          createdBy: "admin",
        });
        await tx.insert(expenses).values({
          date: today,
          category: "fuel",
          description: "وقود",
          amount: "10.00",
          paymentMethod: "كاش",
          createdBy: "admin",
        });
      });

      // Bonuses: 5€ seller (admin) on order-A + 7€ driver-A on order-A's
      // delivery + 9€ driver-B on order-C's delivery. Different deliveries
      // so the UNIQUE (delivery_id, role='driver') constraint isn't violated.
      await withTxInRoute(undefined, async (tx) => {
        const { deliveries } = await import("@/db/schema");
        const [dlA] = await tx
          .insert(deliveries)
          .values({
            refCode: "DL-53A",
            date: today,
            orderId: ordA.id,
            clientId: clientAId,
            clientNameCached: "عميل 5.3",
            status: "مؤكد",
            createdBy: "admin",
          })
          .returning();
        const [dlC] = await tx
          .insert(deliveries)
          .values({
            refCode: "DL-53C",
            date: today,
            orderId: ordC.id,
            clientId: clientAId,
            clientNameCached: "عميل 5.3",
            status: "مؤكد",
            createdBy: "mgr-53b",
          })
          .returning();
        await tx.insert(bonuses).values({
          userId: adminUserId,
          username: "admin",
          role: "seller",
          orderId: ordA.id,
          orderItemId: null,
          deliveryId: dlA.id,
          date: today,
          totalBonus: "5.00",
          status: "unpaid",
        });
        await tx.insert(bonuses).values({
          userId: driverAId,
          username: "drv-53a",
          role: "driver",
          orderId: ordA.id,
          orderItemId: null,
          deliveryId: dlA.id,
          date: today,
          totalBonus: "7.00",
          status: "unpaid",
        });
        await tx.insert(bonuses).values({
          userId: driverBId,
          username: "drv-53b",
          role: "driver",
          orderId: ordC.id,
          orderItemId: null,
          deliveryId: dlC.id,
          date: today,
          totalBonus: "9.00",
          status: "unpaid",
        });
      });

      // Reward: 3€ to seller (admin)
      await withTxInRoute(undefined, (tx) =>
        tx.insert(settlements).values({
          date: today,
          userId: adminUserId,
          username: "admin",
          role: "seller",
          type: "reward",
          amount: "3.00",
          paymentMethod: "كاش",
          createdBy: "admin",
        }),
      );

      // A pre-existing activity_log entry so verifyActivityLogChain has
      // something to verify.
      await withTxInRoute(undefined, (tx) =>
        logActivity(tx, {
          action: "create",
          entityType: "orders",
          entityId: ordA.id,
          entityRefCode: "ORD-53A",
          userId: adminUserId,
          username: "admin",
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

    async function freshDashboardRoute(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return await import("@/app/api/v1/dashboard/route");
    }

    async function freshReportRoute(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return await import("@/app/api/v1/reports/[slug]/route");
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
      username: "mgr-53a",
      role: "manager",
      name: "Manager A",
    });
    const seller = () => ({
      id: sellerId,
      username: "sel-53a",
      role: "seller",
      name: "Seller",
    });
    const driver = () => ({
      id: driverAId,
      username: "drv-53a",
      role: "driver",
      name: "Driver",
    });
    const sk = () => ({
      id: stockKeeperId,
      username: "sk-53a",
      role: "stock_keeper",
      name: "SK",
    });

    async function getDashboard(
      user: ReturnType<typeof admin>,
      qs = "",
    ) {
      const mod = await freshDashboardRoute(user);
      const url = qs
        ? `http://localhost/api/v1/dashboard?${qs}`
        : `http://localhost/api/v1/dashboard`;
      const res = await mod.GET(new Request(url));
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }
    async function getReport(
      user: ReturnType<typeof admin>,
      slug: string,
      qs = "",
    ) {
      const mod = await freshReportRoute(user);
      const url = qs
        ? `http://localhost/api/v1/reports/${slug}?${qs}`
        : `http://localhost/api/v1/reports/${slug}`;
      const res = await mod.GET(new Request(url), {
        params: Promise.resolve({ slug }),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }

    // ───────── Dashboard ─────────

    it("T-DASH-PERM-PM: GET 200", async () => {
      const r = await getDashboard(admin());
      expect(r.status).toBe(200);
    });

    it("T-DASH-PERM-GM: GET 200", async () => {
      const r = await getDashboard(gm());
      expect(r.status).toBe(200);
    });

    it("T-DASH-PERM-MANAGER: GET 200", async () => {
      const r = await getDashboard(managerA());
      expect(r.status).toBe(200);
    });

    it("T-DASH-PERM-SELLER / DRIVER / SK: GET 403", async () => {
      const rs = await getDashboard(seller());
      const rd = await getDashboard(driver());
      const rk = await getDashboard(sk());
      expect(rs.status).toBe(403);
      expect(rd.status).toBe(403);
      expect(rk.status).toBe(403);
    });

    it("T-DASH-KPI-REVENUE: pm sees total of all collections (180€)", async () => {
      const r = await getDashboard(admin());
      const body = r.body as { kpis: { revenue: string } };
      expect(Number(body.kpis.revenue)).toBeCloseTo(180, 2); // 100 + 50 + 30
    });

    it("T-DASH-KPI-NET-PROFIT-PM-FORMULA: matches formula", async () => {
      const r = await getDashboard(admin());
      const body = r.body as { kpis: { netProfit: string | null } };
      // revenue 180 - cogs (3 units × 40 = 120) - expenses 35 - bonuses 21 - giftCost 0 - rewards 3 = 1
      expect(Number(body.kpis.netProfit)).toBeCloseTo(1, 2);
    });

    it("T-DASH-KPI-NET-PROFIT-MANAGER-NULL: manager never sees netProfit/cashProfit", async () => {
      const r = await getDashboard(managerA());
      const body = r.body as { kpis: { netProfit: null; cashProfit: null } };
      expect(body.kpis.netProfit).toBeNull();
      expect(body.kpis.cashProfit).toBeNull();
    });

    it("T-DASH-KPI-OUTSTANDING-DEBTS: 150€ from Order B", async () => {
      const r = await getDashboard(admin());
      const body = r.body as { kpis: { outstandingDebts: string } };
      expect(Number(body.kpis.outstandingDebts)).toBeCloseTo(150, 2);
    });

    it("T-DASH-MANAGER-REVENUE-TEAM-ONLY: manager sees only team's 50€", async () => {
      const r = await getDashboard(managerA());
      const body = r.body as { kpis: { revenue: string } };
      // Only orders with createdBy ∈ { mgr-53a, drv-53a } → only Order B (50€ paid)
      expect(Number(body.kpis.revenue)).toBeCloseTo(50, 2);
    });

    it("T-DASH-COUNTS: lowStockCount detects the 10-unit product under threshold 5", async () => {
      // Lower threshold in-line for this test by updating product
      const { withTxInRoute } = await import("@/db/client");
      const { products } = await import("@/db/schema");
      await withTxInRoute(undefined, (tx) =>
        tx
          .update(products)
          .set({ stock: "2.00", lowStockThreshold: 5 })
          .where(eq(products.id, productAId)),
      );
      const r = await getDashboard(admin());
      const body = r.body as { counts: { lowStockCount: number } };
      expect(body.counts.lowStockCount).toBeGreaterThanOrEqual(1);
    });

    it("T-DASH-TREASURY-BALANCES-MANAGER: only manager_box + linked driver_custody", async () => {
      const r = await getDashboard(managerA());
      const body = r.body as {
        treasuryBalances: Array<{ type: string }>;
      };
      for (const a of body.treasuryBalances) {
        expect(["manager_box", "driver_custody"]).toContain(a.type);
      }
    });

    it("T-DASH-DATE-FILTER: future-dated window excludes today's payments", async () => {
      const future = new Date(Date.now() + 30 * 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const future2 = new Date(Date.now() + 31 * 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const r = await getDashboard(admin(), `dateFrom=${future}&dateTo=${future2}`);
      const body = r.body as { kpis: { revenue: string } };
      expect(Number(body.kpis.revenue)).toBe(0);
    });

    // ───────── Reports ─────────

    it("T-REP-INVALID-SLUG: unknown slug → 404 REPORT_NOT_FOUND", async () => {
      const r = await getReport(admin(), "does-not-exist");
      expect(r.status).toBe(404);
      const body = r.body as { code: string };
      expect(body.code).toBe("REPORT_NOT_FOUND");
    });

    it("T-REP-SLUG-FORBIDDEN-FOR-ROLE: manager requests pm/gm-only pnl → 403", async () => {
      const r = await getReport(managerA(), "pnl");
      expect(r.status).toBe(403);
    });

    it("T-REP-PERM-MATRIX: roles × slugs produce expected status codes", async () => {
      type Role = "pm" | "gm" | "manager" | "seller" | "driver" | "stock_keeper";
      const roles: Array<{ role: Role; user: ReturnType<typeof admin> }> = [
        { role: "pm", user: admin() },
        { role: "gm", user: gm() },
        { role: "manager", user: managerA() },
        { role: "seller", user: seller() },
        { role: "driver", user: driver() },
        { role: "stock_keeper", user: sk() },
      ];
      const pmGmOnly = [
        "pnl",
        "top-clients-by-debt",
        "top-products-by-revenue",
        "expenses-by-category",
      ];
      const managerToo = ["revenue-by-day", "bonuses-by-user"];
      for (const { role, user } of roles) {
        for (const slug of [...pmGmOnly, ...managerToo]) {
          const r = await getReport(user, slug);
          if (role === "pm" || role === "gm") {
            expect(r.status, `${role} / ${slug}`).toBe(200);
          } else if (role === "manager") {
            expect(r.status, `${role} / ${slug}`).toBe(
              managerToo.includes(slug) ? 200 : 403,
            );
          } else {
            expect(r.status, `${role} / ${slug}`).toBe(403);
          }
        }
      }
    });

    it("T-REP-PNL: numbers match formula", async () => {
      const r = await getReport(admin(), "pnl");
      expect(r.status).toBe(200);
      const body = r.body as {
        revenue: string;
        cogs: string;
        expenses: string;
        earnedBonuses: string;
        giftCost: string;
        rewards: string;
        netProfit: string;
      };
      expect(Number(body.revenue)).toBeCloseTo(180, 2);
      expect(Number(body.cogs)).toBeCloseTo(120, 2); // 3 units × 40
      expect(Number(body.expenses)).toBeCloseTo(35, 2);
      expect(Number(body.earnedBonuses)).toBeCloseTo(21, 2); // 5+7+9
      expect(Number(body.giftCost)).toBeCloseTo(0, 2);
      expect(Number(body.rewards)).toBeCloseTo(3, 2);
      expect(Number(body.netProfit)).toBeCloseTo(1, 2);
    });

    it("T-REP-REVENUE-BY-DAY-PM: series non-empty", async () => {
      const r = await getReport(admin(), "revenue-by-day");
      expect(r.status).toBe(200);
      const body = r.body as { series: Array<{ date: string; revenue: string }> };
      expect(body.series.length).toBeGreaterThan(0);
    });

    it("T-REP-REVENUE-BY-DAY-MANAGER-TEAM: manager sees only team revenue (50€)", async () => {
      const r = await getReport(managerA(), "revenue-by-day");
      expect(r.status).toBe(200);
      const body = r.body as { series: Array<{ revenue: string }> };
      const total = body.series.reduce((a, b) => a + Number(b.revenue), 0);
      expect(total).toBeCloseTo(50, 2);
    });

    it("T-REP-TOP-CLIENTS: client-A appears with remaining 150€", async () => {
      const r = await getReport(admin(), "top-clients-by-debt");
      expect(r.status).toBe(200);
      const body = r.body as {
        rows: Array<{ clientId: number; totalRemaining: string }>;
      };
      const row = body.rows.find((x) => x.clientId === clientAId);
      expect(row).toBeTruthy();
      expect(Number(row?.totalRemaining)).toBeCloseTo(150, 2);
    });

    it("T-REP-TOP-PRODUCTS: product-A appears with revenue 300€", async () => {
      const r = await getReport(admin(), "top-products-by-revenue");
      expect(r.status).toBe(200);
      const body = r.body as {
        rows: Array<{ productId: number; revenue: string; qty: string }>;
      };
      const row = body.rows.find((x) => x.productId === productAId);
      expect(row).toBeTruthy();
      // 100 + 200 = 300 (order-A line + order-B line); order-C has no line_items in setup
      expect(Number(row?.revenue)).toBeCloseTo(300, 2);
    });

    it("T-REP-EXPENSES-BY-CATEGORY: two categories summed", async () => {
      const r = await getReport(admin(), "expenses-by-category");
      expect(r.status).toBe(200);
      const body = r.body as { rows: Array<{ category: string; total: string }> };
      const rent = body.rows.find((x) => x.category === "rent");
      const fuel = body.rows.find((x) => x.category === "fuel");
      expect(Number(rent?.total)).toBeCloseTo(25, 2);
      expect(Number(fuel?.total)).toBeCloseTo(10, 2);
    });

    it("T-REP-BONUSES-BY-USER-PM: includes all 3 bonus recipients", async () => {
      const r = await getReport(admin(), "bonuses-by-user");
      expect(r.status).toBe(200);
      const body = r.body as { rows: Array<{ userId: number }> };
      const ids = new Set(body.rows.map((x) => x.userId));
      expect(ids.has(adminUserId)).toBe(true);
      expect(ids.has(driverAId)).toBe(true);
      expect(ids.has(driverBId)).toBe(true);
    });

    it("T-REP-BONUSES-BY-USER-MANAGER-TEAM: manager-A sees only self + driver-A", async () => {
      const r = await getReport(managerA(), "bonuses-by-user");
      expect(r.status).toBe(200);
      const body = r.body as { rows: Array<{ userId: number }> };
      const ids = new Set(body.rows.map((x) => x.userId));
      expect(ids.has(driverAId)).toBe(true);
      expect(ids.has(driverBId)).toBe(false);
      expect(ids.has(adminUserId)).toBe(false);
    });

    it("T-REP-DATE-FILTER: future window excludes every row", async () => {
      const future = new Date(Date.now() + 30 * 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const future2 = new Date(Date.now() + 31 * 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const r = await getReport(
        admin(),
        "pnl",
        `dateFrom=${future}&dateTo=${future2}`,
      );
      const body = r.body as { revenue: string; netProfit: string };
      expect(Number(body.revenue)).toBe(0);
      expect(Number(body.netProfit)).toBe(0);
    });

    it("T-REP-CHAIN-INTACT-AFTER-READS: verifyActivityLogChain remains null", async () => {
      const { withTxInRoute } = await import("@/db/client");
      const { verifyActivityLogChain } = await import("@/lib/activity-log");
      // Ensure chain is intact before reads
      const before = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(before).toBeNull();
      // Trigger dashboard + several report reads
      await getDashboard(admin());
      await getDashboard(managerA());
      await getReport(admin(), "pnl");
      await getReport(admin(), "revenue-by-day");
      await getReport(admin(), "top-clients-by-debt");
      await getReport(managerA(), "bonuses-by-user");
      const after = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(after).toBeNull();
    });
  },
);
