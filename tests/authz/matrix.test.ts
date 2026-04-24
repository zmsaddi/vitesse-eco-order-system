import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "../integration/setup";

// P-audit-2 — Authorization matrix.
//
// Table-driven: 18 endpoints × 6 roles = 108 cells. Each cell asserts
// the coarse allow/deny decision of the route's requireRole gate (or
// service-layer equivalent when a route defers e.g. reports/[slug]).
//
// - `allow` roles must get a NON-auth-denied status: 200/201/400/404/409/412.
//   Business-layer rejections (Zod, foreign-key, not-found) are treated as
//   "auth passed" because they happen AFTER requireRole.
// - `deny` roles must get 401 or 403.
//
// Scope-semantic checks (manager team-only, driver self-only) stay in
// their respective phase tests; this matrix only guards the coarse gate.

type Role = "pm" | "gm" | "manager" | "seller" | "driver" | "stock_keeper";
const ALL_ROLES: readonly Role[] = [
  "pm",
  "gm",
  "manager",
  "seller",
  "driver",
  "stock_keeper",
] as const;

type HttpMethod = "GET" | "POST";

type Entry = {
  id: string;
  method: HttpMethod;
  displayPath: string;
  modulePath: string;
  requestUrl: string;
  pathParams?: Record<string, string>;
  body?: Record<string, unknown>;
  allow: readonly Role[];
};

// Hardcoded matrix — single source of truth for the role × endpoint gate.
// Role lists verified against src/app/api/v1/**/route.ts on commit 143f4c3.
const ENDPOINTS: readonly Entry[] = [
  {
    id: "me-GET",
    method: "GET",
    displayPath: "/api/v1/me",
    modulePath: "@/app/api/v1/me/route",
    requestUrl: "http://localhost/api/v1/me",
    allow: ALL_ROLES,
  },
  {
    id: "dashboard-GET",
    method: "GET",
    displayPath: "/api/v1/dashboard",
    modulePath: "@/app/api/v1/dashboard/route",
    requestUrl: "http://localhost/api/v1/dashboard",
    allow: ["pm", "gm", "manager"],
  },
  {
    id: "action-hub-GET",
    method: "GET",
    displayPath: "/api/v1/action-hub",
    modulePath: "@/app/api/v1/action-hub/route",
    requestUrl: "http://localhost/api/v1/action-hub",
    allow: ["pm", "gm", "manager"],
  },
  {
    id: "activity-GET",
    method: "GET",
    displayPath: "/api/v1/activity",
    modulePath: "@/app/api/v1/activity/route",
    requestUrl: "http://localhost/api/v1/activity",
    allow: ["pm", "gm", "manager"],
  },
  {
    id: "orders-POST",
    method: "POST",
    displayPath: "/api/v1/orders",
    modulePath: "@/app/api/v1/orders/route",
    requestUrl: "http://localhost/api/v1/orders",
    body: {},
    allow: ["pm", "gm", "manager", "seller"],
  },
  {
    id: "orders-id-GET",
    method: "GET",
    displayPath: "/api/v1/orders/[id]",
    modulePath: "@/app/api/v1/orders/[id]/route",
    requestUrl: "http://localhost/api/v1/orders/999999",
    pathParams: { id: "999999" },
    allow: ["pm", "gm", "manager", "seller"],
  },
  {
    id: "deliveries-POST",
    method: "POST",
    displayPath: "/api/v1/deliveries",
    modulePath: "@/app/api/v1/deliveries/route",
    requestUrl: "http://localhost/api/v1/deliveries",
    body: {},
    allow: ["pm", "gm", "manager"],
  },
  {
    id: "deliveries-GET",
    method: "GET",
    displayPath: "/api/v1/deliveries",
    modulePath: "@/app/api/v1/deliveries/route",
    requestUrl: "http://localhost/api/v1/deliveries",
    allow: ["pm", "gm", "manager", "driver"],
  },
  {
    id: "invoices-GET",
    method: "GET",
    displayPath: "/api/v1/invoices",
    modulePath: "@/app/api/v1/invoices/route",
    requestUrl: "http://localhost/api/v1/invoices",
    allow: ["pm", "gm", "manager", "seller", "driver"],
  },
  {
    id: "invoices-avoir-POST",
    method: "POST",
    displayPath: "/api/v1/invoices/[id]/avoir",
    modulePath: "@/app/api/v1/invoices/[id]/avoir/route",
    requestUrl: "http://localhost/api/v1/invoices/999999/avoir",
    pathParams: { id: "999999" },
    body: {},
    allow: ["pm", "gm"],
  },
  {
    id: "treasury-GET",
    method: "GET",
    displayPath: "/api/v1/treasury",
    modulePath: "@/app/api/v1/treasury/route",
    requestUrl: "http://localhost/api/v1/treasury",
    allow: ["pm", "gm", "manager", "driver"],
  },
  {
    id: "users-GET",
    method: "GET",
    displayPath: "/api/v1/users",
    modulePath: "@/app/api/v1/users/route",
    requestUrl: "http://localhost/api/v1/users",
    allow: ["pm", "gm"],
  },
  {
    id: "settlements-GET",
    method: "GET",
    displayPath: "/api/v1/settlements",
    modulePath: "@/app/api/v1/settlements/route",
    requestUrl: "http://localhost/api/v1/settlements",
    allow: ["pm", "gm"],
  },
  {
    // reports/[slug] route allows pm/gm/manager; per-slug service gate
    // narrows `pnl` to pm/gm only. Matrix asserts the effective verdict.
    id: "reports-pnl-GET",
    method: "GET",
    displayPath: "/api/v1/reports/pnl",
    modulePath: "@/app/api/v1/reports/[slug]/route",
    requestUrl: "http://localhost/api/v1/reports/pnl",
    pathParams: { slug: "pnl" },
    allow: ["pm", "gm"],
  },
  {
    id: "bonuses-GET",
    method: "GET",
    displayPath: "/api/v1/bonuses",
    modulePath: "@/app/api/v1/bonuses/route",
    requestUrl: "http://localhost/api/v1/bonuses",
    allow: ["pm", "gm", "seller", "driver"],
  },
  {
    id: "preparation-GET",
    method: "GET",
    displayPath: "/api/v1/preparation",
    modulePath: "@/app/api/v1/preparation/route",
    requestUrl: "http://localhost/api/v1/preparation",
    allow: ["pm", "gm", "manager", "stock_keeper"],
  },
  {
    id: "clients-GET",
    method: "GET",
    displayPath: "/api/v1/clients",
    modulePath: "@/app/api/v1/clients/route",
    requestUrl: "http://localhost/api/v1/clients",
    allow: ["pm", "gm", "manager", "seller"],
  },
  {
    id: "expenses-reverse-POST",
    method: "POST",
    displayPath: "/api/v1/expenses/[id]/reverse",
    modulePath: "@/app/api/v1/expenses/[id]/reverse/route",
    requestUrl: "http://localhost/api/v1/expenses/999999/reverse",
    pathParams: { id: "999999" },
    body: {},
    allow: ["pm", "gm"],
  },
];

describe.skipIf(!HAS_DB)(
  "P-audit-2 authorization matrix (requires TEST_DATABASE_URL)",
  () => {
    const userIds: Partial<Record<Role, number>> = {};

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

      const admin = await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      );
      userIds.pm = admin[0].id;
      userIds.gm = admin[0].id; // same underlying row, different role claim

      const hash = await hashPassword("test-pass-pa2");

      // Manager + driver via wireManagerAndDrivers so the driver gets its
      // required manager_id + driver_custody account (Phase 4.2 invariant).
      const wired = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "pa2",
          driverSuffixes: ["pa2"],
          passwordHash: hash,
        }),
      );
      userIds.manager = wired.managerId;
      userIds.driver = wired.driverIds[0];

      await withTxInRoute(undefined, async (tx) => {
        const sel = await tx
          .insert(users)
          .values({
            username: "sel-pa2",
            password: hash,
            name: "Seller PA2",
            role: "seller",
            active: true,
          })
          .returning();
        userIds.seller = sel[0].id;
        const sk = await tx
          .insert(users)
          .values({
            username: "sk-pa2",
            password: hash,
            name: "SK PA2",
            role: "stock_keeper",
            active: true,
          })
          .returning();
        userIds.stock_keeper = sk[0].id;
      });
    });

    function usernameFor(role: Role): string {
      return role === "gm"
        ? "admin"
        : role === "pm"
          ? "admin"
          : role === "manager"
            ? "mgr-pa2"
            : role === "driver"
              ? "drv-pa2"
              : role === "seller"
                ? "sel-pa2"
                : "sk-pa2";
    }

    async function probe(entry: Entry, role: Role): Promise<number> {
      vi.resetModules();
      vi.doMock("@/auth", () => ({
        auth: async () => ({
          user: {
            id: String(userIds[role]),
            username: usernameFor(role),
            role,
            name: role,
          },
          expires: new Date(Date.now() + 3600_000).toISOString(),
        }),
      }));
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      const mod = (await import(entry.modulePath)) as Record<
        string,
        (req: Request, ctx?: unknown) => Promise<Response>
      >;
      const handler = mod[entry.method];
      if (!handler) {
        throw new Error(`${entry.method} not exported from ${entry.modulePath}`);
      }
      const req = new Request(entry.requestUrl, {
        method: entry.method,
        headers:
          entry.method === "POST"
            ? { "Content-Type": "application/json" }
            : undefined,
        body:
          entry.method === "POST" && entry.body !== undefined
            ? JSON.stringify(entry.body)
            : undefined,
      });
      const ctx = entry.pathParams
        ? { params: Promise.resolve(entry.pathParams) }
        : undefined;
      const res = await handler(req, ctx);
      return res.status;
    }

    // Generate the 108 cells — one test per (endpoint, role).
    const cells: Array<{ entry: Entry; role: Role; expectAllow: boolean }> = [];
    for (const entry of ENDPOINTS) {
      for (const role of ALL_ROLES) {
        cells.push({
          entry,
          role,
          expectAllow: entry.allow.includes(role),
        });
      }
    }

    it.each(cells)(
      "$entry.method $entry.displayPath as $role → $expectAllow",
      async ({ entry, role, expectAllow }) => {
        const status = await probe(entry, role);
        if (expectAllow) {
          // Auth passed — business layer may still reject (Zod/FK/NotFound).
          expect(
            [200, 201, 400, 404, 409, 412],
            `expected auth-passed status; got ${status}`,
          ).toContain(status);
        } else {
          expect(
            [401, 403],
            `expected auth-denied status; got ${status}`,
          ).toContain(status);
        }
      },
    );
  },
);
