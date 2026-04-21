import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.3 — treasury transfer + reconcile.
//
// Coverage matrix (negative-first):
//
// transfer:
//   T-TR1 funding                : main_cash   → manager_box  happy
//   T-TR2 manager_settlement     : manager_box → main_cash    happy
//   T-TR3 bank_deposit           : main_cash   → main_bank    happy
//   T-TR4 bank_withdrawal        : main_bank   → main_cash    happy
//   T-TR-MATRIX invalid route    : main_cash → driver_custody → 409 INVALID_TRANSFER_ROUTE + no side effects
//   T-TR-OD  overdraft           : amount > balance → 409 INSUFFICIENT_BALANCE + no side effects
//   T-TR-UNAUTH seller/mgr/drv   → 403 at route
//   T-TR-IDEM replay             → same movementId, balances unchanged on 2nd call
//   T-TR-CONC two parallel       → one 200 + one 409 INSUFFICIENT_BALANCE (FOR UPDATE)
//
// reconcile:
//   T-RE-POS diff > 0            : movement single-sided (to=account), amount=diff, balance=actual
//   T-RE-NEG diff < 0            : movement single-sided (from=account), amount=|diff|, balance=actual
//   T-RE-ZERO diff == 0          : NO movement inserted; balance set to actual; activity_log still written
//   T-RE-STALE stored stale      : expected recomputed from movements (NOT from cached balance); stale cache doesn't hide real diff
//   T-RE-AUTH-MGR-OK manager own → 200
//   T-RE-AUTH-MGR-X manager other→ 403
//   T-RE-AUTH-PM   pm any        → 200
//   T-RE-UNAUTH seller / driver / stock_keeper → 403
//   T-RE-IDEM replay             → same movementId (or null), balance same as 1st call
//
// append-only regression:
//   T-AP UPDATE treasury_movements on a 4.3-inserted row → rejected by D-58 trigger.

describe.skipIf(!HAS_DB)("Phase 4.3 — treasury transfer + reconcile (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let stockKeeperId: number;
  let managerId: number;
  let managerOtherId: number;
  let driverId: number;
  let mainCashId: number;
  let mainBankId: number;
  let managerBoxId: number;
  let managerOtherBoxId: number;
  let driverCustodyId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    delete process.env.INIT_BOOTSTRAP_SECRET;
    await resetSchema();
    await applyMigrations();

    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    const { POST: initPost } = await import("@/app/api/init/route");
    await initPost(new Request("http://localhost/api/init", { method: "POST" }) as never);

    const { withRead, withTxInRoute } = await import("@/db/client");
    const { users, settings, treasuryAccounts } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    // Seed D-35 settings (so /api/init state is complete + realistic).
    await withTxInRoute(undefined, async (tx) => {
      for (const s of D35_SEED_SETTINGS) {
        await tx
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
      }
    });

    const hash = await hashPassword("test-pass-4.3");

    const wiredA = await withTxInRoute(undefined, (tx) =>
      wireManagerAndDrivers(tx, {
        managerSuffix: "43a",
        driverSuffixes: ["43a"],
        passwordHash: hash,
      }),
    );
    managerId = wiredA.managerId;
    driverId = wiredA.driverIds[0];

    const wiredB = await withTxInRoute(undefined, (tx) =>
      wireManagerAndDrivers(tx, {
        managerSuffix: "43b",
        driverSuffixes: ["43b"],
        passwordHash: hash,
      }),
    );
    managerOtherId = wiredB.managerId;

    [sellerId, stockKeeperId] = await withTxInRoute(undefined, async (tx) => {
      const s = await tx
        .insert(users)
        .values({ username: "sel-43x", password: hash, name: "Seller 43", role: "seller", active: true })
        .returning();
      const sk = await tx
        .insert(users)
        .values({ username: "sk-43", password: hash, name: "SK 43", role: "stock_keeper", active: true })
        .returning();
      return [s[0].id, sk[0].id];
    });

    // Resolve treasury account ids for the fixtures we need to reference
    // across tests.
    const resolve = async (ownerId: number | null, type: string): Promise<number> => {
      const rows = await withRead(undefined, (db) =>
        db
          .select({ id: treasuryAccounts.id })
          .from(treasuryAccounts)
          .where(
            ownerId == null
              ? eq(treasuryAccounts.type, type)
              : and(
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
    mainBankId = await resolve(adminUserId, "main_bank");
    managerBoxId = await resolve(managerId, "manager_box");
    managerOtherBoxId = await resolve(managerOtherId, "manager_box");
    driverCustodyId = await resolve(driverId, "driver_custody");

    // Pre-fund main_cash generously so transfer tests have stock.
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(treasuryAccounts)
        .set({ balance: "10000.00" })
        .where(eq(treasuryAccounts.id, mainCashId));
    });
  });

  function mockSession(user: { id: number; username: string; role: string; name: string }) {
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

  async function freshRoutes(user: { id: number; username: string; role: string; name: string }) {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession(user);
    return {
      transfer: await import("@/app/api/v1/treasury/transfer/route"),
      reconcile: await import("@/app/api/v1/treasury/reconcile/route"),
    };
  }

  const admin = () => ({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
  const seller = () => ({ id: sellerId, username: "sel-43x", role: "seller", name: "Seller" });
  const sk = () => ({ id: stockKeeperId, username: "sk-43", role: "stock_keeper", name: "SK" });
  const manager = () => ({ id: managerId, username: "mgr-43a", role: "manager", name: "Manager A" });
  const driver = () => ({ id: driverId, username: "drv-43a", role: "driver", name: "Driver" });
  // managerOtherId is referenced directly via managerOtherBoxId; no claims helper needed.

  async function callTransfer(
    claims: { id: number; username: string; role: string; name: string },
    body: { fromAccountId: number; toAccountId: number; amount: number; notes?: string },
    idem: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.transfer.POST(
      new Request("http://localhost/api/v1/treasury/transfer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `43-tr-${idem}`,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async function callReconcile(
    claims: { id: number; username: string; role: string; name: string },
    body: { accountId: number; actualBalance: number; notes?: string },
    idem: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.reconcile.POST(
      new Request("http://localhost/api/v1/treasury/reconcile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `43-re-${idem}`,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async function readBalance(accountId: number): Promise<string> {
    const { withRead } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db
        .select({ balance: treasuryAccounts.balance })
        .from(treasuryAccounts)
        .where(eq(treasuryAccounts.id, accountId))
        .limit(1),
    );
    return rows[0]?.balance ?? "0.00";
  }

  async function forceSetBalance(accountId: number, balance: string): Promise<void> {
    const { withTxInRoute } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(treasuryAccounts)
        .set({ balance })
        .where(eq(treasuryAccounts.id, accountId));
    });
  }

  // ─────────────────── transfer ───────────────────

  it("T-TR1 funding happy: main_cash → manager_box writes movement + category='funding' + both balances move", async () => {
    const beforeCash = Number(await readBalance(mainCashId));
    const beforeBox = Number(await readBalance(managerBoxId));
    const res = await callTransfer(
      admin(),
      { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 500 },
      "tr1",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      movementId: number;
      category: string;
      fromBalance: string;
      toBalance: string;
    };
    expect(body.category).toBe("funding");
    expect(Number(body.fromBalance)).toBeCloseTo(beforeCash - 500, 2);
    expect(Number(body.toBalance)).toBeCloseTo(beforeBox + 500, 2);

    const { withRead } = await import("@/db/client");
    const { treasuryMovements } = await import("@/db/schema");
    const mv = await withRead(undefined, (db) =>
      db.select().from(treasuryMovements).where(eq(treasuryMovements.id, body.movementId)).limit(1),
    );
    expect(mv[0].category).toBe("funding");
    expect(mv[0].fromAccountId).toBe(mainCashId);
    expect(mv[0].toAccountId).toBe(managerBoxId);
    expect(Number(mv[0].amount)).toBe(500);
  });

  it("T-TR2 manager_settlement: manager_box → main_cash", async () => {
    // managerBox currently has 500 from T-TR1.
    const res = await callTransfer(
      admin(),
      { fromAccountId: managerBoxId, toAccountId: mainCashId, amount: 100 },
      "tr2",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { category: string };
    expect(body.category).toBe("manager_settlement");
  });

  it("T-TR3 bank_deposit: main_cash → main_bank", async () => {
    const res = await callTransfer(
      admin(),
      { fromAccountId: mainCashId, toAccountId: mainBankId, amount: 200 },
      "tr3",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { category: string };
    expect(body.category).toBe("bank_deposit");
  });

  it("T-TR4 bank_withdrawal: main_bank → main_cash", async () => {
    // main_bank has 200 from T-TR3.
    const res = await callTransfer(
      admin(),
      { fromAccountId: mainBankId, toAccountId: mainCashId, amount: 50 },
      "tr4",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { category: string };
    expect(body.category).toBe("bank_withdrawal");
  });

  it("T-TR-MATRIX invalid route: main_cash → driver_custody rejected with INVALID_TRANSFER_ROUTE; no side effects", async () => {
    const beforeCash = await readBalance(mainCashId);
    const beforeCustody = await readBalance(driverCustodyId);
    const res = await callTransfer(
      admin(),
      { fromAccountId: mainCashId, toAccountId: driverCustodyId, amount: 100 },
      "tr-matrix",
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_TRANSFER_ROUTE");
    expect(await readBalance(mainCashId)).toBe(beforeCash);
    expect(await readBalance(driverCustodyId)).toBe(beforeCustody);
  });

  it("T-TR-OD overdraft: amount > balance → 409 INSUFFICIENT_BALANCE + no side effects", async () => {
    const beforeCash = await readBalance(mainCashId);
    const beforeBox = await readBalance(managerBoxId);
    const res = await callTransfer(
      admin(),
      { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 10_000_000 },
      "tr-od",
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INSUFFICIENT_BALANCE");
    expect(await readBalance(mainCashId)).toBe(beforeCash);
    expect(await readBalance(managerBoxId)).toBe(beforeBox);
  });

  it("T-TR-UNAUTH: seller/manager/driver/stock_keeper → 403", async () => {
    for (const [who, claims] of [
      ["seller", seller()],
      ["manager", manager()],
      ["driver", driver()],
      ["sk", sk()],
    ] as const) {
      const res = await callTransfer(
        claims,
        { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 1 },
        `tr-unauth-${who}`,
      );
      expect(res.status, who).toBe(403);
    }
  });

  it("T-TR-IDEM: same Idempotency-Key replay → same movementId, balances unchanged on 2nd call", async () => {
    const idem = "tr-idem";
    const r1 = await callTransfer(
      admin(),
      { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 40 },
      idem,
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { movementId: number; fromBalance: string };
    const postFirst = await readBalance(mainCashId);

    const r2 = await callTransfer(
      admin(),
      { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: 40 },
      idem,
    );
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { movementId: number };
    expect(b2.movementId).toBe(b1.movementId);
    // Balance did NOT move a second time.
    expect(await readBalance(mainCashId)).toBe(postFirst);
  });

  it("T-TR-CONC: two parallel transfers totalling > balance → one 200, one 409 INSUFFICIENT_BALANCE", async () => {
    // Snapshot current main_cash balance, then run two competing transfers
    // of (balance - 10) each. Only one can fit.
    const bal = Number(await readBalance(mainCashId));
    const attempt = Math.max(1, bal - 10);

    const [rA, rB] = await Promise.all([
      callTransfer(
        admin(),
        { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: attempt },
        "tr-conc-a",
      ),
      callTransfer(
        admin(),
        { fromAccountId: mainCashId, toAccountId: managerBoxId, amount: attempt },
        "tr-conc-b",
      ),
    ]);
    const statuses = [rA.status, rB.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const failed = rA.status === 409 ? await rA.json() : await rB.json();
    expect((failed as { code: string }).code).toBe("INSUFFICIENT_BALANCE");
  });

  // ─────────────────── reconcile ───────────────────

  it("T-RE-POS: diff > 0 → movement(to=account), balance set to actual", async () => {
    // Bring managerBox to a known stable state (matching expected).
    // We use a funding transfer to set expected = N, then reconcile to actual = N + 10.
    const before = Number(await readBalance(managerBoxId));
    const res = await callReconcile(
      admin(),
      { accountId: managerBoxId, actualBalance: before + 10 },
      "re-pos",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      movementId: number | null;
      diff: string;
      actualBalance: string;
    };
    expect(body.movementId).not.toBeNull();
    expect(Number(body.diff)).toBeCloseTo(10, 2);
    expect(Number(body.actualBalance)).toBeCloseTo(before + 10, 2);
    expect(Number(await readBalance(managerBoxId))).toBeCloseTo(before + 10, 2);

    const { withRead } = await import("@/db/client");
    const { treasuryMovements } = await import("@/db/schema");
    const mv = await withRead(undefined, (db) =>
      db.select().from(treasuryMovements).where(eq(treasuryMovements.id, body.movementId!)).limit(1),
    );
    expect(mv[0].category).toBe("reconciliation");
    expect(mv[0].fromAccountId).toBeNull();
    expect(mv[0].toAccountId).toBe(managerBoxId);
    expect(Number(mv[0].amount)).toBeCloseTo(10, 2);
  });

  it("T-RE-NEG: diff < 0 → movement(from=account), balance set to actual", async () => {
    const before = Number(await readBalance(managerBoxId));
    const res = await callReconcile(
      admin(),
      { accountId: managerBoxId, actualBalance: before - 5 },
      "re-neg",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      movementId: number | null;
      diff: string;
    };
    expect(body.movementId).not.toBeNull();
    expect(Number(body.diff)).toBeCloseTo(-5, 2);

    const { withRead } = await import("@/db/client");
    const { treasuryMovements } = await import("@/db/schema");
    const mv = await withRead(undefined, (db) =>
      db.select().from(treasuryMovements).where(eq(treasuryMovements.id, body.movementId!)).limit(1),
    );
    expect(mv[0].fromAccountId).toBe(managerBoxId);
    expect(mv[0].toAccountId).toBeNull();
    expect(Number(mv[0].amount)).toBeCloseTo(5, 2);
    expect(Number(await readBalance(managerBoxId))).toBeCloseTo(before - 5, 2);
  });

  it("T-RE-ZERO: diff == 0 → NO movement inserted; stored balance == actual; activity_log still written", async () => {
    // Movement-expected must match actual. Read current balance and pass it
    // back as actualBalance (the ledger and cache are in sync after the
    // previous tests committed cleanly).
    const current = Number(await readBalance(managerBoxId));
    const res = await callReconcile(
      admin(),
      { accountId: managerBoxId, actualBalance: current },
      "re-zero",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      movementId: number | null;
      diff: string;
    };
    expect(body.movementId).toBeNull();
    expect(Number(body.diff)).toBeCloseTo(0, 2);
    expect(Number(await readBalance(managerBoxId))).toBeCloseTo(current, 2);

    // Activity log must still carry the reconcile event even though no
    // movement row exists.
    const { withRead } = await import("@/db/client");
    const { activityLog } = await import("@/db/schema");
    const acts = await withRead(undefined, (db) =>
      db.select().from(activityLog).where(eq(activityLog.entityId, managerBoxId)),
    );
    // At least the zero-diff reconcile audit entry should be present
    // (entityType='treasury_accounts' when movementId is null).
    const reconcileZero = acts.find(
      (a) => a.entityType === "treasury_accounts" && a.entityId === managerBoxId,
    );
    expect(reconcileZero).toBeDefined();
  });

  it("T-RE-STALE: cached stored balance corrupted; reconcile expected is recomputed from movements (not from stored)", async () => {
    // Corrupt the cached balance directly via SQL — this simulates the
    // exact class of drift reconcile is designed to catch. Movement ledger
    // is untouched.
    const expectedFromMovements = Number(await readBalance(managerBoxId));
    await forceSetBalance(managerBoxId, "999999.99");

    // Pass actualBalance = expectedFromMovements so diff (computed from
    // movements, not from stored) is ZERO. If the implementation read
    // stored instead of movements, it would see stored=999999.99 vs
    // actual=expectedFromMovements → a huge non-zero diff.
    const res = await callReconcile(
      admin(),
      { accountId: managerBoxId, actualBalance: expectedFromMovements },
      "re-stale",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      movementId: number | null;
      diff: string;
      storedBalanceBefore: string;
      expectedBalance: string;
      actualBalance: string;
    };
    // The response documents BOTH values so the contract is verifiable.
    expect(Number(body.storedBalanceBefore)).toBeCloseTo(999999.99, 2);
    expect(Number(body.expectedBalance)).toBeCloseTo(expectedFromMovements, 2);
    expect(Number(body.diff)).toBeCloseTo(0, 2);
    // No movement row (diff is zero relative to expected).
    expect(body.movementId).toBeNull();
    // Stored balance silently corrected to the actual (which equals
    // expected here) — the stale-cache case the reviewer flagged.
    expect(Number(await readBalance(managerBoxId))).toBeCloseTo(expectedFromMovements, 2);
  });

  it("T-RE-AUTH-MGR-OK: manager can reconcile own manager_box", async () => {
    const current = Number(await readBalance(managerBoxId));
    const res = await callReconcile(
      manager(),
      { accountId: managerBoxId, actualBalance: current },
      "re-mgr-ok",
    );
    expect(res.status).toBe(200);
  });

  it("T-RE-AUTH-MGR-X: manager cannot reconcile ANOTHER manager's box (403)", async () => {
    const res = await callReconcile(
      manager(),
      { accountId: managerOtherBoxId, actualBalance: 0 },
      "re-mgr-x",
    );
    expect(res.status).toBe(403);
  });

  it("T-RE-AUTH-PM: pm can reconcile any account (main_cash, driver_custody)", async () => {
    for (const [label, accountId] of [
      ["main_cash", mainCashId],
      ["driver_custody", driverCustodyId],
    ] as const) {
      const current = Number(await readBalance(accountId));
      const res = await callReconcile(
        admin(),
        { accountId, actualBalance: current },
        `re-pm-${label}`,
      );
      expect(res.status, label).toBe(200);
    }
  });

  it("T-RE-UNAUTH: seller / driver / stock_keeper → 403", async () => {
    for (const [who, claims] of [
      ["seller", seller()],
      ["driver", driver()],
      ["sk", sk()],
    ] as const) {
      const res = await callReconcile(
        claims,
        { accountId: managerBoxId, actualBalance: 0 },
        `re-unauth-${who}`,
      );
      expect(res.status, who).toBe(403);
    }
  });

  it("T-RE-IDEM: reconcile replay → same movementId (or same null), balance == actual only once", async () => {
    const idem = "re-idem";
    const current = Number(await readBalance(mainCashId));
    const r1 = await callReconcile(
      admin(),
      { accountId: mainCashId, actualBalance: current + 7 },
      idem,
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { movementId: number | null; actualBalance: string };
    const balanceAfterFirst = Number(await readBalance(mainCashId));
    expect(balanceAfterFirst).toBeCloseTo(current + 7, 2);

    const r2 = await callReconcile(
      admin(),
      { accountId: mainCashId, actualBalance: current + 7 },
      idem,
    );
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { movementId: number | null };
    expect(b2.movementId).toBe(b1.movementId);
    // Balance should NOT have shifted twice (the second call was served
    // from the idempotency cache and skipped the handler entirely).
    expect(Number(await readBalance(mainCashId))).toBeCloseTo(balanceAfterFirst, 2);
  });

  // ─────────────────── append-only regression ───────────────────

  it("T-AP: UPDATE on a transfer/reconcile-inserted movement row is rejected by the D-58 trigger", async () => {
    const { withTxInRoute } = await import("@/db/client");
    let threw = false;
    try {
      await withTxInRoute(undefined, async (tx) => {
        await tx.execute(
          sql.raw(
            `UPDATE treasury_movements SET notes = 'TAMPER-43' WHERE id = (SELECT id FROM treasury_movements WHERE category IN ('funding','reconciliation') ORDER BY id DESC LIMIT 1)`,
          ),
        );
      });
    } catch (e) {
      threw = true;
      const err = e as { message?: string; cause?: unknown };
      const causeMsg = err.cause != null ? String(err.cause) : "";
      const combined = `${err.message ?? ""}\n${causeMsg}`;
      expect(combined).toMatch(/row is immutable.*treasury_movements/i);
    }
    expect(threw).toBe(true);
  });
});
