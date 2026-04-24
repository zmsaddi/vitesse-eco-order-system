import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  D35_SEED_SETTINGS,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 6.3 — Nav 404 Remediation integration tests.
//
// Coverage per the accepted Implementation Contract §6.a:
//   T-63-NAV-*      nav structural + FS walk (6)
//   T-63-INV-*      /api/v1/invoices behaviour relevant to the new page (7)
//   T-63-TR-*       /api/v1/treasury behaviour relevant to the new page (5)
//
// Page components themselves are server components that call Next's
// cookies()/headers()/fetch(); rendering them in vitest requires the full
// Next runtime and is not attempted here (phase-5.3 convention). The API
// layer + nav-coverage invariant together cover the regression surface.

describe.skipIf(!HAS_DB)(
  "Phase 6.3 — Nav 404 Remediation (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerUserId: number;
    let stockKeeperId: number;
    let managerAId: number;
    let driverAId: number;

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
      const { users, clients, settings } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-6.3");

      const teamA = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "63a",
          driverSuffixes: ["63a"],
          passwordHash: hash,
        }),
      );
      managerAId = teamA.managerId;
      driverAId = teamA.driverIds[0];

      [sellerUserId, stockKeeperId] = await withTxInRoute(
        undefined,
        async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-63a",
              password: hash,
              name: "Seller 63a",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-63a",
              password: hash,
              name: "SK 63a",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          return [s[0].id, sk[0].id];
        },
      );

      await withTxInRoute(undefined, (tx) =>
        tx
          .insert(clients)
          .values({
            name: "عميل 6.3",
            phone: "+33600630001",
            createdBy: "admin",
          }),
      );

      // Seed D-35 settings so any invoice-generation path later would work,
      // but this tranche is read-only so we just seed defensively.
      await withTxInRoute(undefined, async (tx) => {
        for (const s of D35_SEED_SETTINGS) {
          await tx
            .insert(settings)
            .values(s)
            .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
        }
      });
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

    async function freshInvoicesRoute(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return await import("@/app/api/v1/invoices/route");
    }

    async function freshTreasuryRoute(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return await import("@/app/api/v1/treasury/route");
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const managerA = () => ({
      id: managerAId,
      username: "mgr-63a",
      role: "manager",
      name: "Manager A",
    });
    const seller = () => ({
      id: sellerUserId,
      username: "sel-63a",
      role: "seller",
      name: "Seller",
    });
    const driver = () => ({
      id: driverAId,
      username: "drv-63a",
      role: "driver",
      name: "Driver",
    });
    const sk = () => ({
      id: stockKeeperId,
      username: "sk-63a",
      role: "stock_keeper",
      name: "SK",
    });

    async function getInvoices(user: ReturnType<typeof admin>, qs = "") {
      const mod = await freshInvoicesRoute(user);
      const url = qs
        ? `http://localhost/api/v1/invoices?${qs}`
        : "http://localhost/api/v1/invoices";
      const res = await mod.GET(new Request(url));
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }

    async function getInvoicesNoSession() {
      vi.resetModules();
      vi.doMock("@/auth", () => ({ auth: async () => null }));
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      const mod = await import("@/app/api/v1/invoices/route");
      const res = await mod.GET(
        new Request("http://localhost/api/v1/invoices"),
      );
      return { status: res.status };
    }

    async function getTreasury(user: ReturnType<typeof admin>, qs = "") {
      const mod = await freshTreasuryRoute(user);
      const url = qs
        ? `http://localhost/api/v1/treasury?${qs}`
        : "http://localhost/api/v1/treasury";
      const res = await mod.GET(new Request(url));
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }

    async function getTreasuryNoSession() {
      vi.resetModules();
      vi.doMock("@/auth", () => ({ auth: async () => null }));
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      const mod = await import("@/app/api/v1/treasury/route");
      const res = await mod.GET(new Request("http://localhost/api/v1/treasury"));
      return { status: res.status };
    }

    // ──────────── Nav coverage + regression ────────────

    it("T-63-NAV-01: every href in every role's nav maps to an on-disk page.tsx", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");

      const appDir = path.resolve(process.cwd(), "src/app/(app)");
      function pageExistsFor(href: string): boolean {
        // Map `/foo/bar` → src/app/(app)/foo/bar/page.tsx
        const rel = href.replace(/^\//, "");
        const full = path.join(appDir, rel, "page.tsx");
        return fs.existsSync(full);
      }

      const offenders: Array<{ role: string; href: string }> = [];
      for (const [role, items] of Object.entries(NAV_BY_ROLE)) {
        for (const item of items) {
          if (!pageExistsFor(item.href)) {
            offenders.push({ role, href: item.href });
          }
        }
      }
      expect(offenders, JSON.stringify(offenders)).toEqual([]);
    });

    it("T-63-NAV-02: /deliveries absent from seller/stock_keeper (narrowed post-Phase 6.4)", async () => {
      // Phase 6.3 originally asserted "/deliveries absent from every role".
      // Phase 6.4 shipped `GET /api/v1/deliveries` + a /deliveries page, so
      // pm/gm/manager/driver legitimately regain the nav entry. Test narrowed
      // to the invariant that outlasts 6.4: seller + stock_keeper still don't
      // see /deliveries (no backend path grants them the list). Presence in
      // the four permitted roles is asserted by T-64-NAV-01.
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");
      for (const role of ["seller", "stock_keeper"] as const) {
        const hrefs = NAV_BY_ROLE[role].map((i) => i.href);
        expect(hrefs, role).not.toContain("/deliveries");
      }
    });

    it("T-63-NAV-03: /inventory is absent from every role's nav", async () => {
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");
      for (const [role, items] of Object.entries(NAV_BY_ROLE)) {
        const hrefs = items.map((i) => i.href);
        expect(hrefs, `${role}`).not.toContain("/inventory");
      }
    });

    it("T-63-NAV-04: /invoices present in all five backend-permitted roles", async () => {
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");
      for (const role of ["pm", "gm", "manager", "seller", "driver"] as const) {
        const hrefs = NAV_BY_ROLE[role].map((i) => i.href);
        expect(hrefs, role).toContain("/invoices");
      }
      // stock_keeper is the only role without /invoices
      expect(
        NAV_BY_ROLE.stock_keeper.map((i) => i.href),
      ).not.toContain("/invoices");
    });

    it("T-63-NAV-05: /treasury present in pm/gm/manager; absent from seller/driver/stock_keeper", async () => {
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");
      for (const role of ["pm", "gm", "manager"] as const) {
        const hrefs = NAV_BY_ROLE[role].map((i) => i.href);
        expect(hrefs, role).toContain("/treasury");
      }
      for (const role of ["seller", "driver", "stock_keeper"] as const) {
        const hrefs = NAV_BY_ROLE[role].map((i) => i.href);
        expect(hrefs, role).not.toContain("/treasury");
      }
    });

    it("T-63-NAV-06: nav item labels remain non-empty Arabic strings", async () => {
      const { NAV_BY_ROLE } = await import("@/components/layout/nav-items");
      for (const [role, items] of Object.entries(NAV_BY_ROLE)) {
        for (const item of items) {
          expect(item.labelAr, `${role} ${item.href}`).toMatch(/\S/);
          expect(item.href, `${role} label=${item.labelAr}`).toMatch(/^\/\S+/);
        }
      }
    });

    // ──────────── Invoices page (via API) ────────────

    it("T-63-INV-AUTH-01: unauth → 401", async () => {
      const r = await getInvoicesNoSession();
      expect(r.status).toBe(401);
    });

    it("T-63-INV-01: pm → 200 with shape { invoices, total }", async () => {
      const r = await getInvoices(admin());
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.invoices)).toBe(true);
      expect(typeof r.body.total).toBe("number");
    });

    it("T-63-INV-02: seller → 200 (backend permits seller per Phase 4.1)", async () => {
      const r = await getInvoices(seller());
      expect(r.status).toBe(200);
    });

    it("T-63-INV-03: manager → 200", async () => {
      const r = await getInvoices(managerA());
      expect(r.status).toBe(200);
    });

    it("T-63-INV-04: driver → 200", async () => {
      const r = await getInvoices(driver());
      expect(r.status).toBe(200);
    });

    it("T-63-INV-05: stock_keeper → 403 (backend rejects)", async () => {
      const r = await getInvoices(sk());
      expect(r.status).toBe(403);
    });

    it("T-63-INV-06: filter round-trip — status + limit are accepted by the schema", async () => {
      const r = await getInvoices(
        admin(),
        "status=%D9%85%D8%A4%D9%83%D8%AF&limit=10", // "مؤكد" URL-encoded
      );
      expect(r.status).toBe(200);
      expect(r.body.invoices.length).toBeLessThanOrEqual(10);
    });

    // ──────────── Treasury page (via API) ────────────

    it("T-63-TR-AUTH-01: unauth → 401", async () => {
      const r = await getTreasuryNoSession();
      expect(r.status).toBe(401);
    });

    it("T-63-TR-01: pm → 200 with shape { accounts, movements, movementsTotal }", async () => {
      const r = await getTreasury(admin());
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.accounts)).toBe(true);
      expect(Array.isArray(r.body.movements)).toBe(true);
      expect(typeof r.body.movementsTotal).toBe("number");
      // post-/api/init the tree seeds main_cash + main_bank (Phase 4.2 init).
      const types = r.body.accounts.map(
        (a: { type: string }) => a.type,
      );
      expect(types).toContain("main_cash");
    });

    it("T-63-TR-02: manager → 200, accounts scoped to own manager_box + linked driver_custody", async () => {
      const r = await getTreasury(managerA());
      expect(r.status).toBe(200);
      for (const a of r.body.accounts) {
        expect(["manager_box", "driver_custody"]).toContain(a.type);
      }
    });

    it("T-63-TR-03: seller → 403 (backend rejects)", async () => {
      const r = await getTreasury(seller());
      expect(r.status).toBe(403);
    });

    it("T-63-TR-04: movements pagination — disjoint slices when offset shifts", async () => {
      const a = await getTreasury(admin(), "movementsLimit=5&movementsOffset=0");
      const b = await getTreasury(admin(), "movementsLimit=5&movementsOffset=5");
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      // If any movements exist they should not repeat across the two pages.
      const idsA = new Set((a.body.movements as Array<{ id: number }>).map((m) => m.id));
      for (const m of b.body.movements as Array<{ id: number }>) {
        expect(idsA.has(m.id)).toBe(false);
      }
    });

    // ──────────── Structural guard: page files exist ────────────

    it("T-63-PAGE-FS: /invoices/page.tsx + /treasury/page.tsx exist on disk", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const appDir = path.resolve(process.cwd(), "src/app/(app)");
      for (const rel of ["invoices/page.tsx", "treasury/page.tsx"]) {
        const full = path.join(appDir, rel);
        expect(fs.existsSync(full), rel).toBe(true);
      }
    });
  },
);
