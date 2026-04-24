import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
} from "../integration/setup";

// P-audit-1 — Real regression pack, file 1/3.
//
// Scope:
//   - CI guard (no skipIf; mirrors P-audit-4 ci-guard pattern, reads test:regression line)
//   - Flow 01 SUBSTITUTE — credentials-chain simulation (see inline disclosure)
//   - Flow 06 — permissions (pm allowed / seller + stock_keeper denied on a canonical endpoint)
//   - Flow 10 — /api/v1 compat (shape of /api/v1/me response)
//   - Flow 11 — Android-ready contract sanity (claims shape a mobile bearer client would need)
//
// Amendments (documented verbatim in delivery report §12):
//   A1 — NOT applied here (soft-delete was file 3's concern).
//   A4 — Post-review correction. Flow 01 originally planned as true HTTP
//        round-trip against /api/auth/[...nextauth]/route. Reviewer rejected
//        the first implementation (hash-verify only). A second attempt via
//        direct handler invocation fails due to a vitest + next-auth + next
//        ESM resolution incompatibility for the bare specifier `next/server`
//        inside next-auth/lib/env.js. Closing this requires either a
//        `vitest.config.ts` deps.inline tweak or a src/auth.ts test-hook
//        export — both out of P-audit-1 scope. Per reviewer directive
//        "لا تُبقِ الاسم 'login'", the tests are renamed T-PA1-AUTHCHAIN-*
//        and mirror the authorize callback logic explicitly (DB lookup +
//        active-check + Argon2 verify). The "login round-trip" regression
//        is deferred to P-audit-3 (Playwright E2E).

describe("P-audit-1 guard", () => {
  it("T-PA1-GUARD-01: CI=true requires TEST_DATABASE_URL (HAS_DB must be true)", () => {
    if (process.env.CI === "true") {
      expect(
        HAS_DB,
        "CI regression runs require TEST_DATABASE_URL secret — missing in this run",
      ).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });

  it("T-PA1-GUARD-02: package.json test:regression must not carry --passWithNoTests", () => {
    expect(typeof HAS_DB).toBe("boolean");
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.["test:regression"] ?? "";
    expect(
      script,
      "test:regression must not contain --passWithNoTests (P-audit-1 regression guard)",
    ).not.toMatch(/--passWithNoTests/);
  });
});

describe.skipIf(!HAS_DB)(
  "P-audit-1 flows 01/06/10/11 (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let stockKeeperId: number;
    let adminPassword: string;

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
      const initRes = await initPost(
        new Request("http://localhost/api/init", { method: "POST" }) as never,
      );
      const initBody = (await initRes.json()) as {
        adminUsername: string;
        adminPassword: string;
      };
      adminPassword = initBody.adminPassword;

      const { withRead, withTxInRoute } = await import("@/db/client");
      const { users } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-audit-1");
      [sellerId, stockKeeperId] = await withTxInRoute(
        undefined,
        async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-pa1",
              password: hash,
              name: "Seller PA1",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-pa1",
              password: hash,
              name: "SK PA1",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          return [s[0].id, sk[0].id];
        },
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

    async function freshRoute(
      module: string,
      user: { id: number; username: string; role: string; name: string } | null,
    ) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      if (user) {
        mockSession(user);
      } else {
        vi.doMock("@/auth", () => ({ auth: async () => null }));
      }
      return await import(module);
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const seller = () => ({
      id: sellerId,
      username: "sel-pa1",
      role: "seller",
      name: "Seller",
    });
    const sk = () => ({
      id: stockKeeperId,
      username: "sk-pa1",
      role: "stock_keeper",
      name: "SK",
    });

    // ─────────────────── Flow 01 substitute — credentials-chain simulation ───────────────────
    //
    // ⚠ TECHNICAL CONSTRAINT — HONEST DISCLOSURE.
    // A true HTTP round-trip through `src/app/api/auth/[...nextauth]/route.ts`
    // is NOT possible inside vitest without either:
    //   (a) `vitest.config.ts` deps.inline = ['next-auth'] to route its ESM
    //       imports through vitest's bundler, or
    //   (b) exposing src/auth.ts's `authorize` callback as a test hook.
    // Both are explicitly out of scope for this tranche (reviewer constraints).
    //
    // Consequence: the test name carries "credentials-chain simulation" — NOT
    // "login" — because we REPLICATE the authorize logic from src/auth.ts
    // rather than invoking it. Same drift risk noted in
    // tests/integration/auth-round-trip.test.ts Group B. Any change to
    // authorize() in src/auth.ts MUST also update this replicated chain to
    // prevent silent divergence. Future P-audit-3 (Playwright E2E) will
    // cover the real HTTP round-trip.

    /**
     * Replicated authorize — mirrors src/auth.ts LoginInput Zod schema +
     * DB lookup + active-check + Argon2 verify. No mutation paths (no
     * needsRehash upgrade); those are covered indirectly by Phase 6.4.
     */
    async function replicatedAuthorize(
      creds: { username?: string; password?: string },
    ): Promise<{ id: string; username: string; role: string; name: string } | null> {
      const u = creds.username ?? "";
      const p = creds.password ?? "";
      if (u.length < 3 || u.length > 64) return null;
      if (p.length < 8) return null;

      const { withRead } = await import("@/db/client");
      const { users } = await import("@/db/schema");
      const { verifyPassword } = await import("@/lib/password");

      const rows = await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, u)).limit(1),
      );
      const row = rows[0];
      if (!row || !row.active) return null;

      const ok = await verifyPassword(p, row.password);
      if (!ok) return null;

      return {
        id: String(row.id),
        username: row.username,
        role: row.role,
        name: row.name,
      };
    }

    it("T-PA1-AUTHCHAIN-01: valid admin creds → authorize returns {id,username,role,name}", async () => {
      const result = await replicatedAuthorize({
        username: "admin",
        password: adminPassword,
      });
      expect(result, "valid credentials must produce a user object").not.toBeNull();
      expect(result!.username).toBe("admin");
      expect(result!.role).toBe("pm");
      expect(Number(result!.id)).toBeGreaterThan(0);
    });

    it("T-PA1-AUTHCHAIN-02: wrong password → authorize returns null (no session)", async () => {
      const result = await replicatedAuthorize({
        username: "admin",
        password: "deliberately-wrong-pw",
      });
      expect(result, "wrong password must yield null").toBeNull();
    });

    it("T-PA1-AUTHCHAIN-03: Zod rejection — username too short → null (never touches DB)", async () => {
      const result = await replicatedAuthorize({ username: "a", password: adminPassword });
      expect(result).toBeNull();
    });

    it("T-PA1-AUTHCHAIN-04: inactive-user guard — active=false → null even with valid password", async () => {
      // Temporarily deactivate admin, assert null, restore.
      const { withTxInRoute } = await import("@/db/client");
      const { users } = await import("@/db/schema");
      await withTxInRoute(undefined, (tx) =>
        tx.update(users).set({ active: false }).where(eq(users.username, "admin")),
      );
      try {
        const result = await replicatedAuthorize({
          username: "admin",
          password: adminPassword,
        });
        expect(result).toBeNull();
      } finally {
        await withTxInRoute(undefined, (tx) =>
          tx.update(users).set({ active: true }).where(eq(users.username, "admin")),
        );
      }
    });

    // ─────────────────── Flow 06 — permissions ───────────────────

    it("T-PA1-PERM-01: pm GET /api/v1/users → 200", async () => {
      const mod = await freshRoute("@/app/api/v1/users/route", admin());
      const res = await mod.GET(new Request("http://localhost/api/v1/users"));
      expect(res.status).toBe(200);
    });

    it("T-PA1-PERM-02: seller GET /api/v1/users → 403", async () => {
      const mod = await freshRoute("@/app/api/v1/users/route", seller());
      const res = await mod.GET(new Request("http://localhost/api/v1/users"));
      expect(res.status).toBe(403);
    });

    it("T-PA1-PERM-03: stock_keeper GET /api/v1/users → 403", async () => {
      const mod = await freshRoute("@/app/api/v1/users/route", sk());
      const res = await mod.GET(new Request("http://localhost/api/v1/users"));
      expect(res.status).toBe(403);
    });

    // ─────────────────── Flow 10 — /api/v1 compat ───────────────────

    it("T-PA1-APIV1-01: /api/v1/me response carries top-level keys {claims, user, nav}", async () => {
      const mod = await freshRoute("@/app/api/v1/me/route", admin());
      const res = await mod.GET(new Request("http://localhost/api/v1/me"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("claims");
      expect(body).toHaveProperty("user");
      expect(body).toHaveProperty("nav");
    });

    it("T-PA1-APIV1-02: claims shape {userId, username, role, name}", async () => {
      const mod = await freshRoute("@/app/api/v1/me/route", admin());
      const res = await mod.GET(new Request("http://localhost/api/v1/me"));
      const body = (await res.json()) as {
        claims: { userId: unknown; username: unknown; role: unknown; name: unknown };
      };
      expect(typeof body.claims.userId).toBe("number");
      expect(typeof body.claims.username).toBe("string");
      expect(typeof body.claims.role).toBe("string");
      expect(typeof body.claims.name).toBe("string");
    });

    // ───────── Flow 11 — Android-ready contract sanity (D-67) ─────────
    // NOT a mobile runtime test; asserts the response SHAPE a bearer-token
    // client would consume.

    it("T-PA1-ANDROID-01: claims.role is one of the six role enum values", async () => {
      const mod = await freshRoute("@/app/api/v1/me/route", admin());
      const res = await mod.GET(new Request("http://localhost/api/v1/me"));
      const body = (await res.json()) as { claims: { role: string } };
      expect([
        "pm",
        "gm",
        "manager",
        "seller",
        "driver",
        "stock_keeper",
      ]).toContain(body.claims.role);
    });

    it("T-PA1-ANDROID-02: claims.userId is a positive integer", async () => {
      const mod = await freshRoute("@/app/api/v1/me/route", admin());
      const res = await mod.GET(new Request("http://localhost/api/v1/me"));
      const body = (await res.json()) as { claims: { userId: number } };
      expect(Number.isInteger(body.claims.userId)).toBe(true);
      expect(body.claims.userId).toBeGreaterThan(0);
    });
  },
);
