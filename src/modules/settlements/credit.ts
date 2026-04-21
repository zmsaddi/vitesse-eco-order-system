import { sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { round2 } from "@/lib/money";

// Phase 4.4 — unapplied-debt helpers for performSettlementPayout +
// listBonuses summary.
//
// A `type='debt'` settlement row has `amount < 0` and `applied=false` until
// consumed by a later `type='settlement'` payout that references it via
// `applied_in_settlement_id`. Consumption is all-or-nothing per user/role:
// every unapplied debt row for the (userId, role) is flipped to applied=true
// on the next payout; if their SUM pushes netPayout below zero, the payout
// rejects with DEBT_EXCEEDS_PAYOUT.

export type UnappliedDebtRow = {
  id: number;
  amount: string; // numeric(19,2), signed negative or zero
};

/**
 * Locks every unapplied debt row for the given (userId, role) FOR UPDATE,
 * ordered by id ASC so concurrent callers acquire them in the same order
 * and cannot deadlock with each other.
 *
 * Returns the rows in the same order acquired. Empty array is valid
 * (user has no outstanding debts).
 */
export async function lockUnappliedDebts(
  tx: DbTx,
  userId: number,
  role: string,
): Promise<UnappliedDebtRow[]> {
  const res = await tx.execute(sql`
    SELECT id, amount
    FROM settlements
    WHERE user_id = ${userId}
      AND role = ${role}
      AND type = 'debt'
      AND applied = false
      AND deleted_at IS NULL
    ORDER BY id ASC
    FOR UPDATE
  `);
  return (res as unknown as { rows?: UnappliedDebtRow[] }).rows ?? [];
}

/**
 * SUM of unapplied debt amounts — always <=0 because debt rows are negative.
 * Returned as a finite number (rounded to 2 decimals).
 */
export function sumDebtAmount(rows: UnappliedDebtRow[]): number {
  let total = 0;
  for (const r of rows) total += Number(r.amount);
  return round2(total);
}

/**
 * Read-only summary query for `listBonuses`. Does NOT lock — intended for
 * the GET endpoint where FOR UPDATE would be harmful (contention).
 * Aggregates across ALL unapplied debts for the user (or all users when
 * userId is undefined — pm/gm audit view sums globally).
 */
export async function readUnappliedDebtTotal(
  db: DbHandle | DbTx,
  userId: number | undefined,
): Promise<number> {
  const filter =
    userId === undefined
      ? sql``
      : sql`AND user_id = ${userId}`;
  const res = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::numeric AS total
    FROM settlements
    WHERE type = 'debt'
      AND applied = false
      AND deleted_at IS NULL
      ${filter}
  `);
  const rows = (res as unknown as { rows?: Array<{ total: string }> }).rows ?? [];
  const raw = rows[0]?.total ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) ? round2(n) : 0;
}
