import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Auth round-trip integration — proves the chain credentials → authorize() → JWT → session claims.
// SKIPPED when TEST_DATABASE_URL is not set.
//
// Phase 1a.1 split:
//   Group A — seed + permissions matrix verification (what Phase 1a actually tested).
//   Group B — real credentials → JWT → session round-trip (what the file NAME implied
//             but Phase 1a did not actually exercise). Phase 1a.1 adds Group B so the
//             file name becomes honest.
//
// Note on scope: we exercise the Auth.js callbacks (authorize, jwt, session) via direct
// invocation rather than spinning up an HTTP server with a cookie jar. This proves the
// DATA chain produces the right claims; it does NOT prove Next.js request pipeline
// end-to-end (that's E2E with Playwright, deferred per D-71).

describe.skipIf(!HAS_DB)(
  "Auth round-trip (requires TEST_DATABASE_URL)",
  () => {
    let adminPassword: string;

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.NEXTAUTH_SECRET =
        process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
      delete process.env.INIT_BOOTSTRAP_SECRET;
      await resetSchema();
      await applyMigrations();

      // Bootstrap admin via /api/init (captures generated password).
      vi.resetModules();
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();
      const { POST } = await import("@/app/api/init/route");
      const req = new Request("http://localhost/api/init", { method: "POST" });
      const res = await POST(req as never);
      if (res.status !== 200) {
        throw new Error(`init failed: ${res.status}`);
      }
      const body = (await res.json()) as { adminPassword: string };
      adminPassword = body.adminPassword;
    });

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    // ─────────────────────────────────────────────────────
    // Group A — seed + permissions matrix verification
    // ─────────────────────────────────────────────────────

    describe("Group A — seed verification", () => {
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

      it("driver can view_assigned orders but not create (task-first — D-72)", async () => {
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
    });

    // ─────────────────────────────────────────────────────
    // Group B — credentials → authorize → jwt → session
    //
    // ⚠ KNOWN CONSTRAINT (accepted post-Phase-1a.1, developer review):
    //   `loadAuthorize()` below REPLICATES the production authorize() logic
    //   from src/auth.ts rather than invoking it. Both paths share the same
    //   dependencies (`withRead`, `users` schema, `verifyPassword`), but they
    //   are two code sites that can drift.
    //
    //   The production path in src/auth.ts may change (e.g. new validation,
    //   rate-limit check, audit log hook) while this test stays green and
    //   exercises a stale copy of the logic.
    //
    // REQUIRED ACTION on the NEXT touch to src/auth.ts or this file:
    //   Choose one:
    //   (a) Replace loadAuthorize() with a call into the REAL provider — e.g.
    //       extract the Credentials provider from src/auth.ts and invoke its
    //       `authorize` method directly. This eliminates the drift risk.
    //   (b) Rename this group from "credentials → authorize" to something
    //       narrower (e.g. "credentials-chain simulation") and remove the
    //       word "authorize" from the case titles, so the test does not
    //       pretend to exercise the production path it merely mirrors.
    //
    // Do NOT ship a Phase 2+ auth change that keeps this simulation name.
    // ─────────────────────────────────────────────────────

    describe("Group B — credentials-chain simulation + Auth.js callbacks", () => {
      // ^ Renamed vs Phase 1a.1 to remove the "authorize" verb from the group
      //   title. Individual case titles below still say "authorize" where they
      //   genuinely exercise authorize-shaped logic; those are scheduled for
      //   rewording when the constraint above is honored.

      async function loadAuthorize() {
        vi.resetModules();
        const envMod = await import("@/lib/env");
        envMod.resetEnvCacheForTesting();

        const { withRead } = await import("@/db/client");
        const { users: usersTable } = await import("@/db/schema");
        const { verifyPassword } = await import("@/lib/password");

        return async (creds: { username?: string; password?: string }) => {
          if (!creds.username || !creds.password) return null;
          if (creds.username.length < 3 || creds.password.length < 8) return null;
          const rows = await withRead(undefined, async (db) =>
            db.select().from(usersTable).where(eq(usersTable.username, creds.username!)).limit(1),
          );
          const user = rows[0];
          if (!user || !user.active) return null;
          if (!(await verifyPassword(creds.password, user.password))) return null;
          return {
            id: String(user.id),
            name: user.name,
            username: user.username,
            role: user.role,
          };
        };
      }

      it("correct admin credentials → returns authorized user payload", async () => {
        const authorize = await loadAuthorize();
        const user = await authorize({ username: "admin", password: adminPassword });
        expect(user).not.toBeNull();
        expect(user).toMatchObject({
          username: "admin",
          role: "pm",
          name: "مدير المشروع",
        });
        expect(user!.id).toMatch(/^\d+$/);
      });

      it("wrong password → returns null (no user leak, no throw)", async () => {
        const authorize = await loadAuthorize();
        const result = await authorize({ username: "admin", password: "not-the-password" });
        expect(result).toBeNull();
      });

      it("unknown username → returns null", async () => {
        const authorize = await loadAuthorize();
        const result = await authorize({ username: "nobody", password: "whatever1234" });
        expect(result).toBeNull();
      });

      it("missing credentials → returns null (no throw)", async () => {
        const authorize = await loadAuthorize();
        expect(await authorize({})).toBeNull();
        expect(await authorize({ username: "admin" })).toBeNull();
        expect(await authorize({ password: adminPassword })).toBeNull();
      });

      it("inactive user → returns null even with correct password", async () => {
        const { withTxInRoute } = await import("@/db/client");
        const { users: usersTable } = await import("@/db/schema");

        await withTxInRoute(undefined, async (tx) =>
          tx.update(usersTable).set({ active: false }).where(eq(usersTable.username, "admin")),
        );
        try {
          const authorize = await loadAuthorize();
          const result = await authorize({ username: "admin", password: adminPassword });
          expect(result).toBeNull();
        } finally {
          await withTxInRoute(undefined, async (tx) =>
            tx.update(usersTable).set({ active: true }).where(eq(usersTable.username, "admin")),
          );
        }
      });

      it("jwt callback populates token.id + username + role from user payload", async () => {
        const { authConfig } = await import("@/auth.config");
        const jwtCallback = authConfig.callbacks!.jwt!;

        const token = await jwtCallback({
          token: {},
          user: { id: "42", username: "admin", role: "pm", name: "مدير المشروع" } as never,
          account: null,
          profile: undefined,
          trigger: "signIn",
          isNewUser: false,
          session: undefined,
        } as never);

        expect(token.id).toBe("42");
        expect((token as { username?: string }).username).toBe("admin");
        expect((token as { role?: string }).role).toBe("pm");
      });

      it("session callback copies claims from token to session.user", async () => {
        const { authConfig } = await import("@/auth.config");
        const sessionCallback = authConfig.callbacks!.session!;

        const session = await sessionCallback({
          session: {
            user: { name: "مدير المشروع", email: null, image: null },
            expires: new Date(Date.now() + 3600_000).toISOString(),
          },
          token: { id: "42", username: "admin", role: "pm", name: "مدير المشروع" } as never,
          user: { id: "42" } as never,
          newSession: undefined,
          trigger: "update",
        } as never);

        const user = session.user as {
          id?: string;
          username?: string;
          role?: string;
        };
        expect(user.id).toBe("42");
        expect(user.username).toBe("admin");
        expect(user.role).toBe("pm");
      });

      it("getSessionClaims extracts typed claims from a well-formed session", async () => {
        vi.doMock("@/auth", () => ({
          auth: async () => ({
            user: { id: "42", username: "admin", role: "pm", name: "مدير المشروع" },
            expires: new Date(Date.now() + 3600_000).toISOString(),
          }),
        }));
        vi.resetModules();
        const envMod = await import("@/lib/env");
        envMod.resetEnvCacheForTesting();
        const { getSessionClaims } = await import("@/lib/session-claims");

        const claims = await getSessionClaims();
        expect(claims).toEqual({
          userId: 42,
          username: "admin",
          role: "pm",
          name: "مدير المشروع",
        });

        vi.doUnmock("@/auth");
      });
    });
  },
);
