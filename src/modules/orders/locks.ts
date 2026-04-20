import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { giftPool, orderItems, orders, products } from "@/db/schema";
import { BusinessRuleError, ConflictError } from "@/lib/api-errors";
import type { CreateOrderItemInput } from "./dto";

// Phase 3.1.1 — canonical lock protocol for createOrder (29_Concurrency §gift_pool).
// Phase 3.1.2 — extended with VIN advisory locks to close the race that two
//               concurrent tx's with disjoint products could both insert the
//               same VIN (product locks alone don't serialize them).
//
// To stay deadlock-free regardless of per-request item order, every createOrder
// invocation MUST acquire its locks in this strict canonical order BEFORE any
// per-item work:
//   1. All unique product_ids mentioned in the payload, sorted ASC, FOR UPDATE.
//   2. All unique product_ids whose item has is_gift=true, sorted ASC, FOR UPDATE
//      against gift_pool.
//   3. All unique normalized VINs (trim + lowercase) mentioned in the payload,
//      sorted ASC, via pg_advisory_xact_lock(hashtext('vin:' || vin)).
//
// Two concurrent calls with overlapping VINs serialize on (3) regardless of
// their product sets. Inside the item loop, processOrderItem() reads/writes
// the already-locked rows without re-acquiring anything (no FOR UPDATE there).

/**
 * Canonical VIN normalization. Used identically on the Node side (within-
 * request dedup + advisory-lock key) and server-side in SQL (LOWER(TRIM(vin)))
 * for the cross-order dedup query.
 */
export function normalizeVin(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export async function acquireOrderCreateLocks(
  tx: DbTx,
  items: CreateOrderItemInput[],
): Promise<void> {
  // (1) Products — unique ids, ASC.
  const productIds = [...new Set(items.map((i) => i.productId))].sort((a, b) => a - b);
  if (productIds.length > 0) {
    await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(asc(products.id))
      .for("update");
  }

  // (2) Gift pool rows — unique product ids for gift items, ASC.
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

  // (3) VIN advisory locks — one per unique normalized VIN, in sorted order.
  // Keyed by "vin:" prefix to avoid colliding with other advisory locks in
  // the codebase (activity_log chain = 1_000_001, cancellations = 1_000_002,
  // idempotency keys = hashtext(key||endpoint), refCode = hashtext(prefix|day)).
  const vinKeys = [
    ...new Set(items.map((i) => normalizeVin(i.vin)).filter((v) => v.length > 0)),
  ].sort();
  for (const vin of vinKeys) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"vin:" + vin}))`);
  }
}

/**
 * BR-21/22 + 28_Edge_Cases VIN_DUPLICATE — within the same request.
 * Two items in the same POST cannot share a non-empty VIN.
 * Case-insensitive + whitespace-trimmed comparison.
 */
export function assertNoDuplicateVinWithinRequest(items: CreateOrderItemInput[]): void {
  const seen = new Map<string, number>(); // normalized vin → first-seen index
  for (let i = 0; i < items.length; i++) {
    const normalized = normalizeVin(items[i].vin);
    if (!normalized) continue;
    const prev = seen.get(normalized);
    if (prev !== undefined) {
      throw new BusinessRuleError(
        `رقم VIN "${items[i].vin}" مكرَّر داخل نفس الطلب (الأصناف ${prev + 1} و${i + 1}).`,
        "VIN_DUPLICATE",
        400,
        undefined,
        { vin: items[i].vin, itemIndexes: [prev, i] },
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
  const unique = [...new Set(items.map((i) => normalizeVin(i.vin)).filter((v) => v.length > 0))];
  if (unique.length === 0) return;

  // Phase 3.1.2: both sides use the canonical LOWER(TRIM(...)) normalization so
  // stored values like " VIN-123 " are still detected against a new "VIN-123".
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
        inArray(sql`LOWER(TRIM(${orderItems.vin}))`, unique),
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
