import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { bonuses, settlements } from "@/db/schema";
import { ConflictError } from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import { round2 } from "@/lib/money";
import { parisIsoDate } from "@/modules/treasury/accounts";

// Phase 4.0.1 — BR-18 bonus action helper for cancelOrder().
//
// BR-18 C1 cancel dialog captures a (seller_bonus_action, driver_bonus_action)
// tuple from the user. Only meaningful when the cancelled order is currently
// "مؤكد" — any earlier status means no bonus rows have been created yet and
// the recorded action is informational only. For confirmed orders we MUST
// actually mutate the bonuses table:
//
//   keep          → UPDATE bonuses SET status='retained' (bonus earned; paid
//                   out when a settlement ships for the recipient).
//   cancel_unpaid → soft-delete every still-unpaid bonus row for that role;
//                   if any row is already 'settled' we refuse with
//                   SETTLED_BONUS_{ROLE} (cannot retroactively erase money
//                   that was already paid out).
//   cancel_as_debt (Phase 4.4) — only valid when every bonus row for the
//                   role is already status='settled'. INSERT one debt row
//                   in `settlements` with type='debt', amount=-SUM(total_bonus),
//                   applied=false, paymentMethod='N/A' (no cash moves at
//                   cancel-time — debt is consumed by the next payout).
//                   If any row is still status='unpaid' (or any other state),
//                   the caller gets BONUS_NOT_SETTLED_FOR_DEBT 409 with zero
//                   side effects.

export type BonusAction = "keep" | "cancel_unpaid" | "cancel_as_debt";

export type BonusActionOutcome = {
  sellerRowsRetained: number;
  sellerRowsCancelled: number;
  driverRowsRetained: number;
  driverRowsCancelled: number;
  sellerDebtSettlementId: number | null;
  sellerDebtAmount: string | null; // signed negative, stringified numeric(19,2)
  driverDebtSettlementId: number | null;
  driverDebtAmount: string | null;
};

type Row = {
  id: number;
  status: string;
  userId: number;
  username: string;
  role: string;
  totalBonus: string;
};

async function loadBonusRows(
  tx: DbTx,
  orderId: number,
  role: "seller" | "driver",
): Promise<Row[]> {
  const rows = await tx
    .select({
      id: bonuses.id,
      status: bonuses.status,
      userId: bonuses.userId,
      username: bonuses.username,
      role: bonuses.role,
      totalBonus: bonuses.totalBonus,
    })
    .from(bonuses)
    .where(
      and(
        eq(bonuses.orderId, orderId),
        eq(bonuses.role, role),
        isNull(bonuses.deletedAt),
      ),
    );
  return rows;
}

function errorCodeForSettled(role: "seller" | "driver"): string {
  return role === "seller" ? "SETTLED_BONUS_SELLER" : "SETTLED_BONUS_DRIVER";
}

type CancelOneOutcome =
  | { retained: number; cancelled: number; debt: null }
  | {
      retained: 0;
      cancelled: 0;
      debt: { settlementId: number; amount: string };
    };

async function applyOneRole(
  tx: DbTx,
  orderId: number,
  role: "seller" | "driver",
  action: BonusAction,
  callerUsername: string,
  callerUserId: number,
): Promise<CancelOneOutcome> {
  const rows = await loadBonusRows(tx, orderId, role);
  if (rows.length === 0) return { retained: 0, cancelled: 0, debt: null };

  if (action === "keep") {
    const res = await tx
      .update(bonuses)
      .set({ status: "retained" })
      .where(
        and(
          eq(bonuses.orderId, orderId),
          eq(bonuses.role, role),
          isNull(bonuses.deletedAt),
        ),
      );
    // drizzle-pg returns a PgQueryResult; fall back to the loaded row count.
    const affected =
      (res as unknown as { rowCount?: number }).rowCount ?? rows.length;
    return { retained: affected, cancelled: 0, debt: null };
  }

  if (action === "cancel_unpaid") {
    const settled = rows.find((r) => r.status !== "unpaid");
    if (settled) {
      throw new ConflictError(
        `لا يمكن إلغاء علاوة ${role === "seller" ? "البائع" : "السائق"} لأنها بحالة "${settled.status}".`,
        errorCodeForSettled(role),
        { orderId, role, bonusId: settled.id, status: settled.status },
      );
    }
    const now = new Date();
    const res = await tx
      .update(bonuses)
      .set({ deletedAt: now })
      .where(
        and(
          eq(bonuses.orderId, orderId),
          eq(bonuses.role, role),
          eq(bonuses.status, "unpaid"),
          isNull(bonuses.deletedAt),
        ),
      );
    const affected =
      (res as unknown as { rowCount?: number }).rowCount ?? rows.length;
    return { retained: 0, cancelled: affected, debt: null };
  }

  // action === "cancel_as_debt"
  //
  // Contract (Phase 4.4 — user directive 2026-04-21):
  //   - Every bonus row for this (orderId, role) must already be status='settled'.
  //   - A row in any other state (unpaid / retained / other) → reject with
  //     BONUS_NOT_SETTLED_FOR_DEBT 409. Zero side effects (rows are not touched,
  //     no settlement row is written, activity_log is not touched).
  //   - SUM(total_bonus) is converted to a single negative-amount debt row in
  //     the `settlements` table. applied=false until consumed by a later
  //     performSettlementPayout. paymentMethod is hardcoded to 'N/A' — no cash
  //     moves at cancel-time, so any other value would be a contract lie.
  //   - NO treasury_movement is written here. Cash outflow (if any) happens
  //     later, at the moment of the consumed settlement.
  const nonSettled = rows.find((r) => r.status !== "settled");
  if (nonSettled) {
    throw new ConflictError(
      `لا يمكن تحويل علاوة ${role === "seller" ? "البائع" : "السائق"} إلى دَين قبل تسويتها — الحالة الحالية "${nonSettled.status}".`,
      "BONUS_NOT_SETTLED_FOR_DEBT",
      {
        orderId,
        role,
        bonusId: nonSettled.id,
        status: nonSettled.status,
      },
    );
  }

  const sum = round2(rows.reduce((acc, r) => acc + Number(r.totalBonus), 0));
  if (sum <= 0) {
    // Defensive — a role-level SUM of zero means there's nothing to offset.
    // Return a no-op outcome; the cancel itself still proceeds.
    return { retained: 0, cancelled: 0, debt: null };
  }

  const debtAmount = -sum;
  const today = parisIsoDate(new Date());
  const inserted = await tx
    .insert(settlements)
    .values({
      date: today,
      userId: rows[0].userId,
      username: rows[0].username,
      role: rows[0].role,
      type: "debt",
      amount: debtAmount.toFixed(2),
      paymentMethod: "N/A",
      notes: `إلغاء علاوة مُسوّاة للطلب #${orderId}`,
      createdBy: callerUsername,
      applied: false,
    })
    .returning({ id: settlements.id });
  const settlementId = inserted[0].id;

  await logActivity(tx, {
    action: "create",
    entityType: "settlements",
    entityId: settlementId,
    userId: callerUserId,
    username: callerUsername,
    details: {
      kind: "debt",
      orderId,
      role,
      bonusIds: rows.map((r) => r.id),
      sumBonus: sum,
      debtAmount,
      applied: false,
    },
  });

  return {
    retained: 0,
    cancelled: 0,
    debt: { settlementId, amount: debtAmount.toFixed(2) },
  };
}

/**
 * Applies BR-18 bonus actions inside the cancelOrder transaction.
 * - If the order isn't currently confirmed, no rows exist and this is a no-op.
 * - Otherwise it validates + mutates seller bonuses and driver bonuses
 *   independently, surfacing ConflictError / BusinessRuleError to roll back
 *   the whole cancel.
 */
export async function applyBonusActionsOnCancel(
  tx: DbTx,
  args: {
    orderId: number;
    fromStatus: string;
    sellerAction: BonusAction;
    driverAction: BonusAction;
    claims: { userId: number; username: string };
  },
): Promise<BonusActionOutcome> {
  if (args.fromStatus !== "مؤكد") {
    return {
      sellerRowsRetained: 0,
      sellerRowsCancelled: 0,
      driverRowsRetained: 0,
      driverRowsCancelled: 0,
      sellerDebtSettlementId: null,
      sellerDebtAmount: null,
      driverDebtSettlementId: null,
      driverDebtAmount: null,
    };
  }

  // Lock all bonus rows for this order to avoid TOCTOU between validation
  // and mutation of the driver/seller branches.
  await tx.execute(
    sql`SELECT id FROM bonuses
        WHERE order_id = ${args.orderId} AND deleted_at IS NULL
        ORDER BY id ASC FOR UPDATE`,
  );

  const seller = await applyOneRole(
    tx,
    args.orderId,
    "seller",
    args.sellerAction,
    args.claims.username,
    args.claims.userId,
  );
  const driver = await applyOneRole(
    tx,
    args.orderId,
    "driver",
    args.driverAction,
    args.claims.username,
    args.claims.userId,
  );

  return {
    sellerRowsRetained: seller.retained,
    sellerRowsCancelled: seller.cancelled,
    driverRowsRetained: driver.retained,
    driverRowsCancelled: driver.cancelled,
    sellerDebtSettlementId: seller.debt?.settlementId ?? null,
    sellerDebtAmount: seller.debt?.amount ?? null,
    driverDebtSettlementId: driver.debt?.settlementId ?? null,
    driverDebtAmount: driver.debt?.amount ?? null,
  };
}

