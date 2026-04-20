import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import {
  cancellations,
  clients,
  orderItems,
  orders,
  products,
} from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import {
  canonicalJSON,
  computeHashChainLink,
  HASH_CHAIN_KEYS,
} from "@/lib/hash-chain";
import { orderRowToDto } from "./mappers";
import { enforceCancelPermission, enforceOrderVisibility, type OrderClaims } from "./permissions";
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

export async function createOrder(
  tx: DbTx,
  input: CreateOrderInput,
  claims: OrderClaims,
): Promise<OrderDto> {
  const clientRows = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (clientRows.length === 0) {
    throw new NotFoundError(`العميل رقم ${input.clientId}`);
  }
  const client = clientRows[0];

  let totalAmount = 0;
  const itemsToInsert: Array<{
    productId: number;
    productNameCached: string;
    category: string;
    quantity: string;
    unitPrice: string;
    costPrice: string;
    lineTotal: string;
    isGift: boolean;
    vin: string;
  }> = [];
  for (const item of input.items) {
    const prodRows = await tx
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .limit(1);
    if (prodRows.length === 0 || !prodRows[0].active) {
      throw new BusinessRuleError(
        `المنتج رقم ${item.productId} غير موجود أو معطَّل.`,
        "PRODUCT_UNAVAILABLE",
        400,
        undefined,
        { productId: item.productId },
      );
    }
    const product = prodRows[0];
    const costPrice = Number(product.buyPrice);
    if (!item.isGift && item.unitPrice < costPrice) {
      throw new BusinessRuleError(
        "سعر البيع أقل من سعر الشراء — غير مقبول.",
        "PRICE_BELOW_COST",
        400,
        undefined,
        { productId: item.productId, unitPrice: item.unitPrice, costPrice },
      );
    }
    const lineTotal = item.isGift ? 0 : item.quantity * item.unitPrice;
    totalAmount += lineTotal;
    itemsToInsert.push({
      productId: item.productId,
      productNameCached: product.name,
      category: product.category,
      quantity: item.quantity.toFixed(2),
      unitPrice: item.isGift ? "0.00" : item.unitPrice.toFixed(2),
      costPrice: costPrice.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
      isGift: item.isGift,
      vin: item.vin,
    });
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
    itemsToInsert.map((it) => ({
      orderId,
      productId: it.productId,
      productNameCached: it.productNameCached,
      category: it.category,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      costPrice: it.costPrice,
      lineTotal: it.lineTotal,
      isGift: it.isGift,
      vin: it.vin,
      commissionRuleSnapshot: {},
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
    },
  });

  return getOrderById(tx as unknown as DbHandle, orderId, claims);
}

export async function startPreparation(
  tx: DbTx,
  id: number,
  claims: OrderClaims,
): Promise<OrderDto> {
  const lockRes = await tx.execute(
    sql`SELECT id, status, created_by FROM orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  const rows = (lockRes as unknown as {
    rows?: Array<{ id: number; status: string; created_by: string }>;
  }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);
  const current = rows[0];
  if (current.status !== "محجوز") {
    throw new ConflictError(
      `لا يمكن بدء التحضير: الحالة الحالية "${current.status}".`,
      "INVALID_STATE_TRANSITION",
      { from: current.status, to: "قيد التحضير" },
    );
  }

  await tx
    .update(orders)
    .set({ status: "قيد التحضير", updatedBy: claims.username, updatedAt: new Date() })
    .where(eq(orders.id, id));

  await logActivity(tx, {
    action: "update",
    entityType: "orders",
    entityId: id,
    userId: claims.userId,
    username: claims.username,
    details: { transition: "محجوز → قيد التحضير" },
  });

  return getOrderById(tx as unknown as DbHandle, id, claims);
}

export async function cancelOrder(
  tx: DbTx,
  id: number,
  input: CancelOrderInput,
  claims: OrderClaims,
): Promise<OrderDto> {
  const lockRes = await tx.execute(
    sql`SELECT id, status, created_by FROM orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  const rows = (lockRes as unknown as {
    rows?: Array<{ id: number; status: string; created_by: string }>;
  }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);
  const current = rows[0];
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

  return getOrderById(tx as unknown as DbHandle, id, claims);
}

// Re-export for tests that used to import from this module.
export { verifyCancellationsChain } from "./chain";
