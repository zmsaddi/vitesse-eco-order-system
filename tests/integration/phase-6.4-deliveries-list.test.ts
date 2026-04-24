import { beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq, isNull } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 6.4 — Deliveries List Endpoint + /deliveries page.
//
// Per Amendment A1 (Contract §0): manager scope = all (same as pm/gm),
// NOT team-scoped. The scope tests assert this explicitly.

describe.skipIf(!HAS_DB)(
  "Phase 6.4 — Deliveries list endpoint + page (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let stockKeeperId: number;
    let managerAId: number;
    let driverAId: number;
    let driverBId: number;
    let clientId: number;
    let deliveryAId: number;
    let deliveryBId: number;
    let deliveryCId: number;
    let listDeliveriesForDriverSnapshot: string;

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
      const { users, clients, orders, deliveries } = await import(
        "@/db/schema"
      );
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-6.4");

      const teamA = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "64a",
          driverSuffixes: ["64a"],
          passwordHash: hash,
        }),
      );
      managerAId = teamA.managerId;
      driverAId = teamA.driverIds[0];

      const teamB = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "64b",
          driverSuffixes: ["64b"],
          passwordHash: hash,
        }),
      );
      driverBId = teamB.driverIds[0];

      [sellerId, stockKeeperId] = await withTxInRoute(
        undefined,
        async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-64a",
              password: hash,
              name: "Seller 64a",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-64a",
              password: hash,
              name: "SK 64a",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          return [s[0].id, sk[0].id];
        },
      );

      clientId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(clients)
            .values({
              name: "عميل 6.4",
              phone: "+33600640001",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      // Three orders + three deliveries spanning dates + statuses.
      const today = new Date().toISOString().slice(0, 10);
      const yesterdayIso = new Date(Date.now() - 86400_000)
        .toISOString()
        .slice(0, 10);
      const tenDaysAgoIso = new Date(Date.now() - 10 * 86400_000)
        .toISOString()
        .slice(0, 10);

      const [ordA, ordB, ordC] = await withTxInRoute(undefined, async (tx) => {
        const a = await tx
          .insert(orders)
          .values({
            refCode: "ORD-64A",
            date: today,
            clientId,
            clientNameCached: "عميل 6.4",
            status: "جاهز",
            paymentMethod: "كاش",
            paymentStatus: "pending",
            totalAmount: "100.00",
            advancePaid: "0.00",
            createdBy: "admin",
          })
          .returning();
        const b = await tx
          .insert(orders)
          .values({
            refCode: "ORD-64B",
            date: yesterdayIso,
            clientId,
            clientNameCached: "عميل 6.4",
            status: "جاهز",
            paymentMethod: "كاش",
            paymentStatus: "pending",
            totalAmount: "150.00",
            advancePaid: "0.00",
            createdBy: "mgr-64a",
          })
          .returning();
        const c = await tx
          .insert(orders)
          .values({
            refCode: "ORD-64C",
            date: tenDaysAgoIso,
            clientId,
            clientNameCached: "عميل 6.4",
            status: "جاهز",
            paymentMethod: "كاش",
            paymentStatus: "pending",
            totalAmount: "200.00",
            advancePaid: "0.00",
            createdBy: "admin",
          })
          .returning();
        return [a[0], b[0], c[0]];
      });

      // Delivery A → assigned to driver-A, status جاهز (pending)
      // Delivery B → assigned to driver-A, status جاري التوصيل
      // Delivery C → assigned to driver-B (cross-team), status تم التوصيل
      const [dA, dB, dC] = await withTxInRoute(undefined, async (tx) => {
        const a = await tx
          .insert(deliveries)
          .values({
            refCode: "DL-64A",
            date: today,
            orderId: ordA.id,
            clientId,
            clientNameCached: "عميل 6.4",
            status: "جاهز",
            assignedDriverId: driverAId,
            assignedDriverUsernameCached: "drv-64a",
            createdBy: "admin",
          })
          .returning();
        const b = await tx
          .insert(deliveries)
          .values({
            refCode: "DL-64B",
            date: yesterdayIso,
            orderId: ordB.id,
            clientId,
            clientNameCached: "عميل 6.4",
            status: "جاري التوصيل",
            assignedDriverId: driverAId,
            assignedDriverUsernameCached: "drv-64a",
            createdBy: "mgr-64a",
          })
          .returning();
        const c = await tx
          .insert(deliveries)
          .values({
            refCode: "DL-64C",
            date: tenDaysAgoIso,
            orderId: ordC.id,
            clientId,
            clientNameCached: "عميل 6.4",
            status: "تم التوصيل",
            assignedDriverId: driverBId,
            assignedDriverUsernameCached: "drv-64b",
            createdBy: "admin",
          })
          .returning();
        return [a[0], b[0], c[0]];
      });
      deliveryAId = dA.id;
      deliveryBId = dB.id;
      deliveryCId = dC.id;

      // Snapshot listDeliveriesForDriver.toString() for regression (REG-01).
      const svc = await import("@/modules/deliveries/service");
      listDeliveriesForDriverSnapshot =
        svc.listDeliveriesForDriver.toString();
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
      return await import("@/app/api/v1/deliveries/route");
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const gm = () => ({ id: adminUserId, username: "admin", role: "gm", name: "GM" });
    const managerA = () => ({
      id: managerAId,
      username: "mgr-64a",
      role: "manager",
      name: "Manager A",
    });
    const driver = () => ({
      id: driverAId,
      username: "drv-64a",
      role: "driver",
      name: "Driver A",
    });
    const seller = () => ({
      id: sellerId,
      username: "sel-64a",
      role: "seller",
      name: "Seller",
    });
    const sk = () => ({
      id: stockKeeperId,
      username: "sk-64a",
      role: "stock_keeper",
      name: "SK",
    });

    async function getDeliveries(user: ReturnType<typeof admin>, qs = "") {
      const mod = await freshRoute(user);
      const url = qs
        ? `http://localhost/api/v1/deliveries?${qs}`
        : "http://localhost/api/v1/deliveries";
      const res = await mod.GET(new Request(url));
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }

    async function getDeliveriesNoSession() {
      vi.resetModules();
      vi.doMock("@/auth", () => ({ auth: async () => null }));
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      const mod = await import("@/app/api/v1/deliveries/route");
      const res = await mod.GET(
        new Request("http://localhost/api/v1/deliveries"),
      );
      return { status: res.status };
    }

    // ──────────── Authorization matrix ────────────

    it("T-64-AUTH-01: unauth → 401", async () => {
      const r = await getDeliveriesNoSession();
      expect(r.status).toBe(401);
    });

    it("T-64-AUTH-02: pm → 200", async () => {
      const r = await getDeliveries(admin());
      expect(r.status).toBe(200);
    });

    it("T-64-AUTH-03: gm → 200", async () => {
      const r = await getDeliveries(gm());
      expect(r.status).toBe(200);
    });

    it("T-64-AUTH-04: manager → 200", async () => {
      const r = await getDeliveries(managerA());
      expect(r.status).toBe(200);
    });

    it("T-64-AUTH-05: driver → 200", async () => {
      const r = await getDeliveries(driver());
      expect(r.status).toBe(200);
    });

    it("T-64-AUTH-06: seller + stock_keeper → 403 each", async () => {
      const rs = await getDeliveries(seller());
      const rk = await getDeliveries(sk());
      expect(rs.status).toBe(403);
      expect(rk.status).toBe(403);
    });

    // ──────────── Scope (post-Amendment A1: manager = all) ────────────

    it("T-64-SCOPE-01: pm sees all 3 seeded deliveries", async () => {
      const r = await getDeliveries(admin());
      expect(r.body.total).toBeGreaterThanOrEqual(3);
      const ids = (r.body.deliveries as Array<{ id: number }>).map((d) => d.id);
      expect(ids).toEqual(
        expect.arrayContaining([deliveryAId, deliveryBId, deliveryCId]),
      );
    });

    it("T-64-SCOPE-02: gm sees same as pm", async () => {
      const rp = await getDeliveries(admin());
      const rg = await getDeliveries(gm());
      expect(rg.body.total).toBe(rp.body.total);
    });

    it("T-64-SCOPE-03: manager sees all (NOT team-scoped — Amendment A1)", async () => {
      const r = await getDeliveries(managerA());
      const ids = (r.body.deliveries as Array<{ id: number }>).map((d) => d.id);
      // Crucially, Delivery C (assigned to driver-B in team B) is visible to
      // manager-A under the current Phase 4 permissions contract.
      expect(ids).toContain(deliveryCId);
    });

    it("T-64-SCOPE-04: manager-A asking for driver-B's rows returns them verbatim (no team intersection)", async () => {
      const r = await getDeliveries(
        managerA(),
        `assignedDriverId=${driverBId}`,
      );
      const ids = (r.body.deliveries as Array<{ id: number }>).map((d) => d.id);
      expect(ids).toContain(deliveryCId);
      // No row from driver-A should leak into this filtered view.
      expect(ids).not.toContain(deliveryAId);
      expect(ids).not.toContain(deliveryBId);
    });

    it("T-64-SCOPE-05: driver sees only own (delegated to listDeliveriesForDriver)", async () => {
      const r = await getDeliveries(driver());
      for (const d of r.body.deliveries as Array<{
        assignedDriverId: number;
      }>) {
        expect(d.assignedDriverId).toBe(driverAId);
      }
      // Row count should match the direct helper call.
      const { withRead } = await import("@/db/client");
      const { listDeliveriesForDriver } = await import(
        "@/modules/deliveries/service"
      );
      const direct = await withRead(undefined, (db) =>
        listDeliveriesForDriver(db, driverAId, { limit: 200 }),
      );
      expect(r.body.total).toBe(direct.total);
    });

    it("T-64-SCOPE-06: driver passing foreign assignedDriverId still gets only own", async () => {
      const r = await getDeliveries(
        driver(),
        `assignedDriverId=${driverBId}`,
      );
      for (const d of r.body.deliveries as Array<{
        assignedDriverId: number;
      }>) {
        expect(d.assignedDriverId).toBe(driverAId);
      }
    });

    // ──────────── Filters ────────────

    it("T-64-FIL-01: status filter narrows to exact match", async () => {
      const r = await getDeliveries(
        admin(),
        "status=%D8%AC%D8%A7%D9%87%D8%B2", // "جاهز"
      );
      for (const d of r.body.deliveries as Array<{ status: string }>) {
        expect(d.status).toBe("جاهز");
      }
    });

    it("T-64-FIL-02: date range narrows the set", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400_000)
        .toISOString()
        .slice(0, 10);
      const r = await getDeliveries(
        admin(),
        `dateFrom=${yesterday}&dateTo=${today}`,
      );
      const ids = (r.body.deliveries as Array<{ id: number }>).map((d) => d.id);
      expect(ids).toContain(deliveryAId);
      expect(ids).toContain(deliveryBId);
      expect(ids).not.toContain(deliveryCId); // 10 days ago → out of range
    });

    it("T-64-FIL-03: assignedDriverId narrows to that driver", async () => {
      const r = await getDeliveries(
        admin(),
        `assignedDriverId=${driverAId}`,
      );
      for (const d of r.body.deliveries as Array<{
        assignedDriverId: number;
      }>) {
        expect(d.assignedDriverId).toBe(driverAId);
      }
    });

    it("T-64-FIL-04: invalid date format → 400 VALIDATION", async () => {
      const r = await getDeliveries(admin(), "dateFrom=not-a-date");
      expect(r.status).toBe(400);
    });

    it("T-64-FIL-05: limit=201 → 400 (cap at 200)", async () => {
      const r = await getDeliveries(admin(), "limit=201");
      expect(r.status).toBe(400);
    });

    // ──────────── Pagination ────────────

    it("T-64-PAG-01: disjoint slices across offsets", async () => {
      const a = await getDeliveries(admin(), "limit=2&offset=0");
      const b = await getDeliveries(admin(), "limit=2&offset=2");
      const idsA = new Set(
        (a.body.deliveries as Array<{ id: number }>).map((d) => d.id),
      );
      for (const d of b.body.deliveries as Array<{ id: number }>) {
        expect(idsA.has(d.id)).toBe(false);
      }
    });

    it("T-64-PAG-02: total matches an independent COUNT(*)", async () => {
      const { withRead } = await import("@/db/client");
      const { deliveries } = await import("@/db/schema");
      const countRows = await withRead(undefined, (db) =>
        db
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(isNull(deliveries.deletedAt))
          .orderBy(asc(deliveries.id)),
      );
      const r = await getDeliveries(admin(), "limit=200");
      expect(r.body.total).toBe(countRows.length);
    });

    // ──────────── Nav coverage ────────────

    it("T-64-NAV-01: /deliveries present in pm/gm/manager/driver nav", async () => {
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");
      for (const role of ["pm", "gm", "manager", "driver"] as const) {
        const hrefs = NAV_BY_ROLE[role].map((i) => i.href);
        expect(hrefs, role).toContain("/deliveries");
      }
      for (const role of ["seller", "stock_keeper"] as const) {
        const hrefs = NAV_BY_ROLE[role].map((i) => i.href);
        expect(hrefs, role).not.toContain("/deliveries");
      }
    });

    it("T-64-NAV-02: every nav href still maps to an on-disk page.tsx", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");
      const appDir = path.resolve(process.cwd(), "src/app/(app)");
      const offenders: Array<{ role: string; href: string }> = [];
      for (const [role, items] of Object.entries(NAV_BY_ROLE)) {
        for (const item of items) {
          const rel = item.href.replace(/^\//, "");
          const full = path.join(appDir, rel, "page.tsx");
          if (!fs.existsSync(full)) offenders.push({ role, href: item.href });
        }
      }
      expect(offenders, JSON.stringify(offenders)).toEqual([]);
    });

    // ──────────── Regression ────────────

    it("T-64-REG-01: listDeliveriesForDriver byte-identical to snapshot", async () => {
      const svc = await import("@/modules/deliveries/service");
      expect(svc.listDeliveriesForDriver.toString()).toBe(
        listDeliveriesForDriverSnapshot,
      );
    });

    it("T-64-REG-02: POST /api/v1/deliveries still responds (structural smoke)", async () => {
      vi.resetModules();
      mockSession(admin());
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      const mod = await import("@/app/api/v1/deliveries/route");
      expect(typeof mod.POST).toBe("function");
      expect(typeof mod.GET).toBe("function");
    });

    it("T-64-REG-03: response shape matches { deliveries, total }", async () => {
      const r = await getDeliveries(admin());
      expect(r.body).toHaveProperty("deliveries");
      expect(r.body).toHaveProperty("total");
      expect(Array.isArray(r.body.deliveries)).toBe(true);
      expect(typeof r.body.total).toBe("number");
    });

    it("T-64-REG-04: activity_log chain null before and after reads", async () => {
      const { withTxInRoute } = await import("@/db/client");
      const { verifyActivityLogChain } = await import("@/lib/activity-log");
      const before = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(before).toBeNull();
      await getDeliveries(admin());
      await getDeliveries(managerA());
      await getDeliveries(driver());
      const after = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(after).toBeNull();
    });
  },
);
