import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { bonuses } from "@/db/schema";
import { BusinessRuleError, ConflictError } from "@/lib/api-errors";

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
//   cancel_as_debt→ deferred until the settlements flow ships (Phase 6). The
//                   intent is to create a debt entry against the recipient
//                   for a settled bonus that's being clawed back. Until that
//                   table exists we refuse with SETTLEMENT_FLOW_NOT_SHIPPED.

export type BonusAction = "keep" | "cancel_unpaid" | "cancel_as_debt";

export type BonusActionOutcome = {
  sellerRowsRetained: number;
  sellerRowsCancelled: number;
  driverRowsRetained: number;
  driverRowsCancelled: number;
};

type Row = { id: number; status: string };

async function loadBonusRows(
  tx: DbTx,
  orderId: number,
  role: "seller" | "driver",
): Promise<Row[]> {
  const rows = await tx
    .select({ id: bonuses.id, status: bonuses.status })
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

async function applyOneRole(
  tx: DbTx,
  orderId: number,
  role: "seller" | "driver",
  action: BonusAction,
): Promise<{ retained: number; cancelled: number }> {
  const rows = await loadBonusRows(tx, orderId, role);
  if (rows.length === 0) return { retained: 0, cancelled: 0 };

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
    return { retained: affected, cancelled: 0 };
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
    return { retained: 0, cancelled: affected };
  }

  // action === "cancel_as_debt"
  throw new BusinessRuleError(
    "لم يُشحن بعد مسار التسويات (Phase 6) — لا يمكن تحويل علاوة إلى دَين حالياً.",
    "SETTLEMENT_FLOW_NOT_SHIPPED",
    412,
    undefined,
    { orderId, role, action },
  );
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
  },
): Promise<BonusActionOutcome> {
  if (args.fromStatus !== "مؤكد") {
    return {
      sellerRowsRetained: 0,
      sellerRowsCancelled: 0,
      driverRowsRetained: 0,
      driverRowsCancelled: 0,
    };
  }

  // Lock all bonus rows for this order to avoid TOCTOU between validation
  // and mutation of the driver/seller branches.
  await tx.execute(
    sql`SELECT id FROM bonuses
        WHERE order_id = ${args.orderId} AND deleted_at IS NULL
        ORDER BY id ASC FOR UPDATE`,
  );

  const seller = await applyOneRole(tx, args.orderId, "seller", args.sellerAction);
  const driver = await applyOneRole(tx, args.orderId, "driver", args.driverAction);

  return {
    sellerRowsRetained: seller.retained,
    sellerRowsCancelled: seller.cancelled,
    driverRowsRetained: driver.retained,
    driverRowsCancelled: driver.cancelled,
  };
}
