import { eq, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { treasuryAccounts, treasuryMovements } from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  PermissionError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import type { ReconcileInput } from "./dto";
import {
  lockAccountForUpdate,
  parisIsoDate,
  parseNumeric,
  round2,
} from "./accounts";
import {
  assertCanReconcile,
  type TreasuryClaims,
} from "./permissions";

// Phase 4.3 — daily reconciliation (BR-54).
//
// Canonical source-of-truth rule (12_Accounting_Rules §reconcile +
// 10_Calculation_Formulas §treasury): the EXPECTED balance is
// recomputed from treasury_movements inside the same tx, NOT read
// from the cached treasury_accounts.balance. This guarantees the
// reconciliation surfaces any drift between the cached stored balance
// and the movement ledger — exactly the class of bug daily reconcile
// is supposed to catch.
//
// Semantics:
//   expected = Σ movements where (to_account_id = id) - Σ movements
//              where (from_account_id = id), all within FOR UPDATE.
//   diff     = actualBalance - expected.
//   If diff ≠ 0  ⇒ insert a single-sided reconciliation movement
//                  recording |diff| (from=NULL or to=NULL, never both).
//                  Update stored balance to actualBalance.
//   If diff == 0 ⇒ NO movement row. The ledger already matches reality.
//                  Stored balance is corrected silently to actualBalance
//                  when it was stale.
//   Either way, exactly one activity_log entry is written in-tx.

export type ReconcileResult = {
  /** null when diff == 0 (no treasury_movement inserted). */
  movementId: number | null;
  expectedBalance: string;
  storedBalanceBefore: string;
  actualBalance: string;
  diff: string;
};

async function computeExpectedBalance(
  tx: DbTx,
  accountId: number,
): Promise<number> {
  const res = await tx.execute(sql`
    SELECT COALESCE(SUM(CASE
      WHEN to_account_id = ${accountId} THEN amount
      WHEN from_account_id = ${accountId} THEN -amount
      ELSE 0
    END), 0)::numeric AS expected
    FROM treasury_movements
    WHERE from_account_id = ${accountId} OR to_account_id = ${accountId}
  `);
  const rows = (res as unknown as { rows?: Array<{ expected: string }> }).rows ?? [];
  const raw = rows[0]?.expected ?? "0";
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new BusinessRuleError(
      "فشل حساب الرصيد المتوقع من حركات الصندوق.",
      "TREASURY_EXPECTED_COMPUTATION_FAILED",
      500,
      `computeExpectedBalance: non-finite sum ${raw} for account ${accountId}`,
      { accountId, raw },
    );
  }
  return round2(n);
}

export async function performReconcile(
  tx: DbTx,
  input: ReconcileInput,
  claims: TreasuryClaims,
): Promise<ReconcileResult> {
  assertCanReconcile(claims);

  // Defense-in-depth guard on the input (Zod already enforces min:0).
  if (input.actualBalance < 0) {
    throw new BusinessRuleError(
      "الرصيد الفعلي لا يمكن أن يكون سالباً.",
      "VALIDATION_FAILED",
      400,
    );
  }

  // Lock the target account row first — any concurrent transfer/bridge/
  // handover that mutates its balance or inserts a movement touching it
  // must commit or abort before we compute `expected`.
  const account = await lockAccountForUpdate(tx, input.accountId);
  if (!account) {
    throw new ConflictError(
      "حساب الصندوق غير موجود.",
      "TREASURY_ACCOUNT_MISSING",
      { accountId: input.accountId },
    );
  }

  // Fine-grained role gate: manager may reconcile ONLY their own
  // manager_box. pm/gm can reconcile any account type.
  if (claims.role === "manager") {
    if (account.type !== "manager_box" || account.owner_user_id !== claims.userId) {
      throw new PermissionError(
        "لا يمكنك مصالحة صندوق ليس لك.",
      );
      // Note: the generic PermissionError uses code='FORBIDDEN' (403). The
      // project-wide convention is to log this as a permission boundary
      // rather than a business rule. Explicit RECONCILE_NOT_OWNER is
      // surfaced via the response body's message so the frontend can map
      // it back if needed.
    }
  }

  // Re-compute expected from the ledger (source of truth — 12_Accounting_Rules).
  // This MUST happen AFTER the FOR UPDATE so any in-flight movement touching
  // the account has either committed (visible here) or aborted (invisible).
  const expected = await computeExpectedBalance(tx, account.id);
  const actual = round2(input.actualBalance);
  const stored = parseNumeric(account.balance);
  const diff = round2(actual - expected);

  let movementId: number | null = null;

  if (Math.abs(diff) > 0.005) {
    // Diff materialises as a single-sided reconciliation movement. Amount
    // on the movement is always positive; direction captured by which
    // side holds the account id.
    const movementValues = {
      date: parisIsoDate(new Date()),
      category: "reconciliation",
      fromAccountId: diff < 0 ? account.id : null,
      toAccountId: diff > 0 ? account.id : null,
      amount: Math.abs(diff).toFixed(2),
      referenceType: null,
      referenceId: null,
      notes: input.notes,
      createdBy: claims.username,
    };
    const inserted = await tx
      .insert(treasuryMovements)
      .values(movementValues)
      .returning({ id: treasuryMovements.id });
    movementId = inserted[0].id;
  }

  // In both branches (movement or no-movement) the stored cached balance
  // gets set to actual. When diff==0 and stored was stale, this is the
  // silent correction; when diff≠0 it mirrors the new expected (expected +
  // diff = actual).
  await tx
    .update(treasuryAccounts)
    .set({ balance: actual.toFixed(2) })
    .where(eq(treasuryAccounts.id, account.id));

  // Activity log — always, in the same tx. When a movement was inserted we
  // point entityId at that row; when not, we log the audit checkpoint
  // against the treasury_accounts row.
  await logActivity(tx, {
    action: movementId !== null ? "create" : "update",
    entityType: movementId !== null ? "treasury_movements" : "treasury_accounts",
    entityId: movementId !== null ? movementId : account.id,
    userId: claims.userId,
    username: claims.username,
    details: {
      kind: "reconciliation",
      accountId: account.id,
      accountType: account.type,
      storedBalanceBefore: stored,
      expectedBalanceFromMovements: expected,
      actualBalance: actual,
      diff,
      movementId,
    },
  });

  return {
    movementId,
    expectedBalance: expected.toFixed(2),
    storedBalanceBefore: stored.toFixed(2),
    actualBalance: actual.toFixed(2),
    diff: diff.toFixed(2),
  };
}
