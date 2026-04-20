import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { giftPool, orderItems, orders, products } from "@/db/schema";
import { BusinessRuleError, ConflictError } from "@/lib/api-errors";
import type { CreateOrderItemInput } from "./dto";

// Phase 3.1.1 — canonical lock protocol for createOrder (29_Concurrency §gift_pool).
//
// To stay deadlock-free regardless of per-request item order, every createOrder
// invocation MUST acquire row locks in this global order, BEFORE any per-item
// work:
//   1. All unique product_ids mentioned in the payload, sorted ASC, FOR UPDATE.
//   2. All unique product_ids whose item has is_gift=true, sorted ASC, FOR UPDATE
//      against gift_pool.
//
// This "lock-all-once-at-tx-start" matches the spec's protocol. Inside the item
// loop, processOrderItem() then reads/writes those already-locked rows without
// re-acquiring locks (no FOR UPDATE inside the loop).

export async function acquireOrderCreateLocks(
  tx: DbTx,
  items: CreateOrderItemInput[],
): Promise<void> {
  // Unique product ids, ASC — lock all rows once, ordered, so concurrent
  // createOrder calls on the same product set acquire locks in identical
  // order regardless of the caller's payload ordering (no deadlock).
  const productIds = [...new Set(items.map((i) => i.productId))].sort((a, b) => a - b);
  if (productIds.length > 0) {
    await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(asc(products.id))
      .for("update");
  }

  // Unique gift product ids, ASC — gift_pool FOR UPDATE (29_Concurrency).
  const giftProductIds = [
    ...new Set(items.filter((i) => i.isGift).map((i) => i.productId)),
  ].sort((a, b) => a - b);
  if (giftProductIds.length > 0) {
    await tx
      .select({ id: giftPool.id })
      .from(giftPool)
      .where(inArray(giftPool.productId, giftProductIds))
      .orderBy(asc(giftPool.productId))
      .for("update");
  }
}

/**
 * BR-21/22 + 28_Edge_Cases VIN_DUPLICATE — within the same request.
 * Two items in the same POST cannot share a non-empty VIN.
 * Case-insensitive + whitespace-trimmed comparison.
 */
export function assertNoDuplicateVinWithinRequest(items: CreateOrderItemInput[]): void {
  const seen = new Map<string, number>(); // vin → index
  for (let i = 0; i < items.length; i++) {
    const raw = items[i].vin?.trim() ?? "";
    if (!raw) continue;
    const normalized = raw.toLowerCase();
    const prev = seen.get(normalized);
    if (prev !== undefined) {
      throw new BusinessRuleError(
        `رقم VIN "${raw}" مكرَّر داخل نفس الطلب (الأصناف ${prev + 1} و${i + 1}).`,
        "VIN_DUPLICATE",
        400,
        undefined,
        { vin: raw, itemIndexes: [prev, i] },
      );
    }
    seen.set(normalized, i);
  }
}

/**
 * BR-21/22 + 28_Edge_Cases VIN_DUPLICATE — across active order_items.
 * "Active" = order_items.deleted_at IS NULL AND parent orders.deleted_at IS NULL
 * AND parent orders.status != 'ملغي'. A cancelled order frees its VINs.
 * Case-insensitive match (VIN normalization: trim + LOWER).
 */
export async function assertNoDuplicateVinAcrossOrders(
  tx: DbTx,
  items: CreateOrderItemInput[],
): Promise<void> {
  const vins = items
    .map((i) => i.vin?.trim() ?? "")
    .filter((v): v is string => v.length > 0)
    .map((v) => v.toLowerCase());
  if (vins.length === 0) return;
  const unique = [...new Set(vins)];

  const rows = await tx
    .select({
      vin: orderItems.vin,
      orderItemId: orderItems.id,
      orderId: orderItems.orderId,
      parentStatus: orders.status,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        inArray(sql`LOWER(${orderItems.vin})`, unique),
        ne(orderItems.vin, ""),
        isNull(orderItems.deletedAt),
        isNull(orders.deletedAt),
        ne(orders.status, "ملغي"),
      ),
    )
    .limit(1);
  if (rows.length > 0) {
    const clash = rows[0];
    throw new ConflictError(
      `رقم VIN "${clash.vin}" مستخدَم على طلب آخر نشط (الطلب رقم ${clash.orderId}).`,
      "VIN_DUPLICATE",
      {
        vin: clash.vin,
        existingOrderId: clash.orderId,
        existingOrderItemId: clash.orderItemId,
      },
    );
  }
}
