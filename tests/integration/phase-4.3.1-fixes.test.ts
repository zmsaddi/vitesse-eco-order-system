import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.3.1 — two tightly scoped fixes on top of Phase 4.3:
//   (1) Money precision: strict 2 decimals on TransferInput.amount and
//       ReconcileInput.actualBalance. Sub-cent values are rejected at the
//       wire; `round2(amount) < 0.01` is rejected at the service layer
//       so no zero-value movement can ever be inserted.
//   (2) Reconcile owner-drift: the manager-reconciles-another-box path
//       returns a dedicated 403 `RECONCILE_NOT_OWNER` code (was generic
//       `FORBIDDEN`). Closes the drift between the original contract,
//       the code, and the docs.
//
// Coverage:
//   T-TR-PREC-004    amount=0.004 → 400 VALIDATION_FAILED
//   T-TR-PREC-005    amount=0.005 → 400 VALIDATION_FAILED (3-decimal refine)
//   T-TR-PREC-HAPPY  amount=0.01 → 200 (smallest-legal-unit regression)
//   T-RE-PREC        actualBalance=10.004 → 400 VALIDATION_FAILED
//   T-RE-MGR-X-CODE  manager cross-team reconcile → 403 + code==='RECONCILE_NOT_OWNER'

describe.skipIf(!HAS_DB)(
  "Phase 4.3.1 — money precision + reconcile owner code (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let managerOtherBoxId: number;
    let mainCashId: number;
    let managerBoxId: number;
    let managerId: number;

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
      const { users, settings, treasuryAccounts } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      await withTxInRoute(undefined, async (tx) => {
        for (const s of D35_SEED_SETTINGS) {
          await tx
            .insert(settings)
            .values(s)
            .onConflictDoUpdate({
              target: settings.key,
              set: { value: s.value },
            });
        }
      });

      const hash = await hashPassword("test-pass-4.3.1");

      const wiredA = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "431a",
          driverSuffixes: ["431a"],
          passwordHash: hash,
        }),
      );
      managerId = wiredA.managerId;

      const wiredB = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "431b",
          driverSuffixes: ["431b"],
          passwordHash: hash,
        }),
      );

      const resolve = async (ownerId: number, type: string): Promise<number> => {
        const rows = await withRead(undefined, (db) =>
          db
            .select({ id: treasuryAccounts.id })
            .from(treasuryAccounts)
            .where(
              and(
                eq(treasuryAccounts.type, type),
                eq(treasuryAccounts.ownerUserId, ownerId),
              ),
            )
            .limit(1),
        );
        expect(rows.length).toBe(1);
        return rows[0].id;
      };
      mainCashId = await resolve(adminUserId, "main_cash");
      managerBoxId = await resolve(managerId, "manager_box");
      managerOtherBoxId = await resolve(wiredB.managerId, "manager_box");

      // Pre-fund main_cash so the happy-path transfer has source stock.
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(treasuryAccounts)
          .set({ balance: "1000.00" })
          .where(eq(treasuryAccounts.id, mainCashId));
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

    async function freshRoutes(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.resetModules();
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();
      mockSession(user);
      return {
        transfer: await import("@/app/api/v1/treasury/transfer/route"),
        reconcile: await import("@/app/api/v1/treasury/reconcile/route"),
      };
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const manager = () => ({
      id: managerId,
      username: "mgr-431a",
      role: "manager",
      name: "Manager A",
    });

    async function callTransfer(body: {
      fromAccountId: number;
      toAccountId: number;
      amount: number;
    }, idem: string): Promise<Response> {
      const r = await freshRoutes(admin());
      return r.transfer.POST(
        new Request("http://localhost/api/v1/treasury/transfer", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `431-tr-${idem}`,
          },
          body: JSON.stringify(body),
        }),
      );
    }

    async function callReconcile(
      claims: { id: number; username: string; role: string; name: string },
      body: { accountId: number; actualBalance: number },
      idem: string,
    ): Promise<Response> {
      const r = await freshRoutes(claims);
      return r.reconcile.POST(
        new Request("http://localhost/api/v1/treasury/reconcile", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `431-re-${idem}`,
          },
          body: JSON.stringify(body),
        }),
      );
    }

    // ─────────────────── money precision ───────────────────

    it("T-TR-PREC-004: transfer amount=0.004 → 400 VALIDATION_FAILED (sub-cent rejected at wire)", async () => {
      const res = await callTransfer(
        { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 0.004 },
        "prec-004",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("T-TR-PREC-005: transfer amount=0.005 → 400 VALIDATION_FAILED (3-decimal refine rejects)", async () => {
      const res = await callTransfer(
        { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 0.005 },
        "prec-005",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("T-TR-PREC-HAPPY: transfer amount=0.01 passes all layers (smallest-legal-unit regression)", async () => {
      const res = await callTransfer(
        { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 0.01 },
        "prec-happy",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        movementId: number;
        category: string;
      };
      expect(body.category).toBe("funding");
      expect(typeof body.movementId).toBe("number");
    });

    it("T-RE-PREC: reconcile actualBalance=10.004 → 400 VALIDATION_FAILED (strict 2 decimals)", async () => {
      const res = await callReconcile(
        admin(),
        { accountId: managerBoxId, actualBalance: 10.004 },
        "re-prec",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    // ─────────────────── owner-code drift fix ───────────────────

    it("T-RE-MGR-X-CODE: manager cross-team reconcile → 403 with code RECONCILE_NOT_OWNER (not generic FORBIDDEN)", async () => {
      const res = await callReconcile(
        manager(),
        { accountId: managerOtherBoxId, actualBalance: 0 },
        "re-mgr-x-code",
      );
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("RECONCILE_NOT_OWNER");
    });
  },
);
