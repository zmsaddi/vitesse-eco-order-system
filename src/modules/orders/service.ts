import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import {
  cancellations,
  clients,
  orderItems,
  orders,
} from "@/db/schema";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import {
  canonicalJSON,
  computeHashChainLink,
  HASH_CHAIN_KEYS,
} from "@/lib/hash-chain";
import {
  acquireOrderCreateLocks,
  assertNoDuplicateVinAcrossOrders,
  assertNoDuplicateVinWithinRequest,
} from "./locks";
import { orderRowToDto } from "./mappers";
import { enforceCancelPermission, enforceOrderVisibility, type OrderClaims } from "./permissions";
import { loadPricingContext, processOrderItem } from "./pricing";
import { generateOrderRefCode } from "./ref-code";
import type {
  CancelOrderInput,
  CreateOrderInput,
  OrderDto,
} from "./dto";

// Phase 3.0.1 — orders core service refactor:
// - Visibility + cancel permission enforcement split into ./permissions.
// - ref_code generation split into ./ref-code (BR-67 ORD-YYYYMMDD-NNNNN).
// - cancellations hash-chain now uses @/lib/hash-chain (advisory-locked).
// - cancellations chain verifier for tests → ./chain.ts.

export type { OrderClaims } from "./permissions";

export async function getOrderById(
  db: DbHandle,
  id: number,
  claims: OrderClaims,
): Promise<OrderDto> {
  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)))
    .limit(1);
  if (orderRows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);

  enforceOrderVisibility(orderRows[0], claims);

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)));

  return orderRowToDto(orderRows[0], items);
}

/**
 * Internal read used by mutation echoes (post-create/transition/cancel). The
 * role-based visibility check applies to external GET requests; once the caller
 * has already passed their mutation's permission gate, echoing the row back is
 * safe even if their role wouldn't satisfy the broader GET visibility rules
 * (e.g. stock_keeper completing a state transition).
 */
async function fetchOrderInternal(
  db: DbHandle | DbTx,
  id: number,
): Promise<OrderDto> {
  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)))
    .limit(1);
  if (orderRows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)));
  return orderRowToDto(orderRows[0], items);
}

export async function createOrder(
  tx: DbTx,
  input: CreateOrderInput,
  claims: OrderClaims,
): Promise<OrderDto> {
  // Phase 3.1.1: canonical lock protocol + VIN dedup BEFORE any per-item work.
  // (1) Synchronous within-request VIN duplicate check — doesn't need a DB trip.
  assertNoDuplicateVinWithinRequest(input.items);
  // (2) Acquire row locks in a deterministic order (product ids ASC, then
  //     gift_pool product ids ASC) so concurrent tx's on the same row set
  //     can't deadlock regardless of input payload order.
  await acquireOrderCreateLocks(tx, input.items);
  // (3) Cross-order VIN duplicate check against active order_items.
  await assertNoDuplicateVinAcrossOrders(tx, input.items);

  const clientRows = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (clientRows.length === 0) {
    throw new NotFoundError(`العميل رقم ${input.clientId}`);
  }
  const client = clientRows[0];

  const ctx = await loadPricingContext(tx, { role: claims.role, username: claims.username });

  // Per-item validation + discount + VIN + gift-pool + commission snapshot + stock decrement.
  // No FOR UPDATE inside — all needed rows are already locked.
  const processed: Awaited<ReturnType<typeof processOrderItem>>[] = [];
  let totalAmount = 0;
  for (const item of input.items) {
    const row = await processOrderItem(tx, ctx, item);
    processed.push(row);
    totalAmount += Number(row.lineTotal);
  }

  const refCode = await generateOrderRefCode(tx);

  const orderInserted = await tx
    .insert(orders)
    .values({
      refCode,
      date: input.date,
      clientId: input.clientId,
      clientNameCached: client.name,
      clientPhoneCached: client.phone ?? "",
      status: "محجوز",
      paymentMethod: input.paymentMethod,
      paymentStatus: "pending",
      totalAmount: totalAmount.toFixed(2),
      advancePaid: "0.00",
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning();
  const orderId = orderInserted[0].id;

  await tx.insert(orderItems).values(
    processed.map((it) => ({
      orderId,
      productId: it.productId,
      productNameCached: it.productNameCached,
      category: it.category,
      quantity: it.quantity,
      recommendedPrice: it.recommendedPrice,
      unitPrice: it.unitPrice,
      costPrice: it.costPrice,
      discountType: it.discountType,
      discountValue: it.discountValue,
      lineTotal: it.lineTotal,
      isGift: it.isGift,
      vin: it.vin,
      commissionRuleSnapshot: it.commissionRuleSnapshot,
    })),
  );

  await logActivity(tx, {
    action: "create",
    entityType: "orders",
    entityId: orderId,
    entityRefCode: refCode,
    userId: claims.userId,
    username: claims.username,
    details: {
      clientId: input.clientId,
      itemCount: input.items.length,
      totalAmount,
      hasGifts: processed.some((r) => r.isGift),
    },
  });

  return fetchOrderInternal(tx, orderId);
}

async function lockOrder(
  tx: DbTx,
  id: number,
): Promise<{ id: number; status: string; created_by: string }> {
  const lockRes = await tx.execute(
    sql`SELECT id, status, created_by FROM orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  const rows = (lockRes as unknown as {
    rows?: Array<{ id: number; status: string; created_by: string }>;
  }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);
  return rows[0];
}

async function transitionStatus(
  tx: DbTx,
  id: number,
  from: string,
  to: string,
  claims: OrderClaims,
): Promise<OrderDto> {
  const current = await lockOrder(tx, id);
  if (current.status !== from) {
    throw new ConflictError(
      `لا يمكن الانتقال إلى "${to}": الحالة الحالية "${current.status}".`,
      "INVALID_STATE_TRANSITION",
      { from: current.status, to, expectedFrom: from },
    );
  }

  await tx
    .update(orders)
    .set({ status: to, updatedBy: claims.username, updatedAt: new Date() })
    .where(eq(orders.id, id));

  await logActivity(tx, {
    action: "update",
    entityType: "orders",
    entityId: id,
    userId: claims.userId,
    username: claims.username,
    details: { transition: `${from} → ${to}` },
  });

  return fetchOrderInternal(tx, id);
}

export async function startPreparation(
  tx: DbTx,
  id: number,
  claims: OrderClaims,
): Promise<OrderDto> {
  return transitionStatus(tx, id, "محجوز", "قيد التحضير", claims);
}

export async function markReady(
  tx: DbTx,
  id: number,
  claims: OrderClaims,
): Promise<OrderDto> {
  return transitionStatus(tx, id, "قيد التحضير", "جاهز", claims);
}

export async function cancelOrder(
  tx: DbTx,
  id: number,
  input: CancelOrderInput,
  claims: OrderClaims,
): Promise<OrderDto> {
  const current = await lockOrder(tx, id);
  if (current.status === "ملغي") {
    throw new ConflictError(
      "الطلب ملغى مسبقاً.",
      "ALREADY_CANCELLED",
      { id, status: current.status },
    );
  }

  enforceCancelPermission({ status: current.status, createdBy: current.created_by }, claims);

  if (input.returnToStock) {
    const itemRows = await tx
      .select({ productId: orderItems.productId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)));
    for (const it of itemRows) {
      await tx.execute(
        sql`UPDATE products SET stock = stock + ${it.quantity} WHERE id = ${it.productId}`,
      );
    }
  }

  await tx
    .update(orders)
    .set({
      status: "ملغي",
      updatedBy: claims.username,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));

  // Cancellations row — hash-chain via shared advisory-locked helper.
  const cancCanonical = canonicalJSON({
    cancelledBy: claims.username,
    driverBonusAction: input.driverBonusAction,
    orderId: id,
    reason: input.reason,
    refundAmount: 0,
    returnToStock: input.returnToStock ? 1 : 0,
    sellerBonusAction: input.sellerBonusAction,
  });
  const { prevHash, rowHash } = await computeHashChainLink(
    tx,
    { chainLockKey: HASH_CHAIN_KEYS.cancellations, tableName: "cancellations" },
    cancCanonical,
  );

  await tx.insert(cancellations).values({
    orderId: id,
    cancelledBy: claims.username,
    reason: input.reason,
    refundAmount: "0.00",
    returnToStock: input.returnToStock ? 1 : 0,
    sellerBonusAction: input.sellerBonusAction,
    driverBonusAction: input.driverBonusAction,
    deliveryStatusBefore: current.status,
    notes: null,
    prevHash,
    rowHash,
  });

  await logActivity(tx, {
    action: "cancel",
    entityType: "orders",
    entityId: id,
    userId: claims.userId,
    username: claims.username,
    details: {
      reason: input.reason,
      returnToStock: input.returnToStock,
      sellerBonusAction: input.sellerBonusAction,
      driverBonusAction: input.driverBonusAction,
      fromStatus: current.status,
    },
  });

  return fetchOrderInternal(tx, id);
}

// Re-export for tests that used to import from this module.
export { verifyCancellationsChain } from "./chain";
