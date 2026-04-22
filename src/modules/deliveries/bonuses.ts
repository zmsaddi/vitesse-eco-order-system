import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { bonuses, orderItems, users } from "@/db/schema";
import { emitNotifications } from "@/modules/notifications/events";

// Phase 4.0 bonus computation on confirm-delivery (13_Commission_Rules formulas).
//
// Called ONCE per delivery transition to "تم التوصيل". Reads the immutable
// commission_rule_snapshot captured at order-create time (D-17 freeze) and
// writes one bonus row per non-gift order_item (seller) + exactly one row
// per delivery (driver). The partial unique indexes on `bonuses` (D-29) are
// a race-safe backstop: even if this runs twice, the second write fails with
// 23505 — callers rely on the idempotency wrapper above to prevent that in
// the first place.

export type ConfirmActor = { userId: number; username: string; role: string };

type OrderItemRow = typeof orderItems.$inferSelect;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Resolve the seller user (order.createdBy) to an integer userId. */
async function resolveSellerId(
  tx: DbTx,
  sellerUsername: string,
): Promise<{ userId: number; username: string } | null> {
  const rows = await tx
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, sellerUsername))
    .limit(1);
  return rows.length > 0 ? { userId: rows[0].id, username: rows[0].username } : null;
}

function snapshotNumber(
  snapshot: unknown,
  key: "seller_fixed_per_unit" | "seller_pct_overage" | "driver_fixed_per_delivery",
): number {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const v = (snapshot as Record<string, unknown>)[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeSellerItemBonus(item: OrderItemRow): {
  fixedPart: number;
  overagePart: number;
  totalBonus: number;
} {
  const snap = item.commissionRuleSnapshot;
  const sellerFixed = snapshotNumber(snap, "seller_fixed_per_unit");
  const sellerPct = snapshotNumber(snap, "seller_pct_overage");
  const actualPrice = Number(item.unitPrice);
  const recommendedPrice = Number(item.recommendedPrice);
  const quantity = Number(item.quantity);

  const fixedTotal = round2(sellerFixed * quantity);
  const extraMargin = Math.max(0, actualPrice - recommendedPrice);
  const extraBonus = round2((extraMargin * quantity * sellerPct) / 100);
  const total = round2(fixedTotal + extraBonus);
  return { fixedPart: fixedTotal, overagePart: extraBonus, totalBonus: total };
}

export async function computeBonusesOnConfirm(
  tx: DbTx,
  args: {
    orderId: number;
    deliveryId: number;
    date: string;
    sellerUsername: string;
    driverUserId: number;
    driverUsername: string;
  },
): Promise<{ sellerRowsInserted: number; driverRowInserted: boolean }> {
  // Resolve seller user.
  const seller = await resolveSellerId(tx, args.sellerUsername);
  if (!seller) {
    // Seller account might be disabled/renamed; we still compute driver bonus.
    // Seller-side skipped with a warning-level activity_log entry outside this fn.
  }

  // Non-gift items only — gifts yield no commission (BR-30 implied; gifts = 0 value).
  const items = await tx
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, args.orderId), isNull(orderItems.deletedAt)));
  const chargeable = items.filter((i) => !i.isGift);

  // Phase 5.1 — resolve orderRefCode once up-front for BONUS_CREATED notifications.
  const ordRefRows = await tx.execute(
    sql`SELECT ref_code FROM orders WHERE id = ${args.orderId} LIMIT 1`,
  );
  const orderRefCode =
    (ordRefRows as unknown as { rows?: Array<{ ref_code: string }> }).rows?.[0]
      ?.ref_code ?? `ORD-${args.orderId}`;

  let sellerRowsInserted = 0;
  if (seller) {
    for (const item of chargeable) {
      const { fixedPart, overagePart, totalBonus } = computeSellerItemBonus(item);
      const ins = await tx
        .insert(bonuses)
        .values({
          userId: seller.userId,
          username: seller.username,
          role: "seller",
          orderId: args.orderId,
          orderItemId: item.id,
          deliveryId: args.deliveryId,
          date: args.date,
          fixedPart: fixedPart.toFixed(2),
          overagePart: overagePart.toFixed(2),
          totalBonus: totalBonus.toFixed(2),
          status: "unpaid",
        })
        .returning({ id: bonuses.id });
      sellerRowsInserted++;
      // Phase 5.1 — BONUS_CREATED → seller (line 37 of the matrix).
      await emitNotifications(tx, {
        type: "BONUS_CREATED",
        bonusId: ins[0].id,
        bonusUserId: seller.userId,
        amount: totalBonus.toFixed(2),
        orderRefCode,
      });
    }
  }

  // Driver bonus — one row per delivery (D-29). Read driver_fixed_per_delivery from
  // any chargeable item's snapshot (same value across an order per D-17 merge).
  const firstSnap = chargeable[0]?.commissionRuleSnapshot ?? items[0]?.commissionRuleSnapshot;
  const driverFixed = snapshotNumber(firstSnap, "driver_fixed_per_delivery");
  const driverBonus = round2(driverFixed);

  // Only insert the driver row when there's something to earn; zero-value still
  // valuable for audit so we always insert if the delivery actually happened.
  const drvIns = await tx
    .insert(bonuses)
    .values({
      userId: args.driverUserId,
      username: args.driverUsername,
      role: "driver",
      orderId: args.orderId,
      orderItemId: null, // D-29 driver rows are per-delivery, not per-item
      deliveryId: args.deliveryId,
      date: args.date,
      fixedPart: driverBonus.toFixed(2),
      overagePart: "0.00",
      totalBonus: driverBonus.toFixed(2),
      status: "unpaid",
    })
    .returning({ id: bonuses.id });

  // Phase 5.1 — BONUS_CREATED → driver (line 37 of the matrix). Emitted even
  // when the computed amount is zero (audit trail clarity — the driver did
  // complete the delivery).
  await emitNotifications(tx, {
    type: "BONUS_CREATED",
    bonusId: drvIns[0].id,
    bonusUserId: args.driverUserId,
    amount: driverBonus.toFixed(2),
    orderRefCode,
  });

  return { sellerRowsInserted, driverRowInserted: true };
}

// Small re-export so unit tests can exercise the pure math.
export const __test__ = { computeSellerItemBonus, round2, snapshotNumber };
