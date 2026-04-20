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
import { orderRowToDto } from "./mappers";
import type {
  CancelOrderInput,
  CreateOrderInput,
  OrderDto,
} from "./dto";

// Phase 3.0 orders core service. Minimal flow:
//   - createOrder: validates client + products, computes line_total per item,
//     inserts order + order_items, writes activity_log.
//   - getOrderById: fetches order + items (no cross-domain joins — pure orders).
//   - cancelOrder: C1 transaction (BR-18, partial — bonuses N/A in Phase 3):
//       * status → 'ملغي' + cancel metadata
//       * return_to_stock → UPDATE products.stock FOR UPDATE per item
//       * INSERT cancellations row with the 3 user choices + hash-chain
//       * bonus_action = keep | cancel_unpaid | cancel_as_debt:
//           - No bonus rows exist yet (calculated on delivery — Phase 4), so all
//             three are effectively "intent recorded in cancellations row" here.
//       * INSERT activity_log
//   - startPreparation: status transition محجوز → قيد التحضير + activity_log.

export async function getOrderById(db: DbHandle, id: number): Promise<OrderDto> {
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
  claims: { userId: number; username: string },
): Promise<OrderDto> {
  // Validate client (active + not soft-deleted).
  const clientRows = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (clientRows.length === 0) {
    throw new NotFoundError(`العميل رقم ${input.clientId}`);
  }
  const client = clientRows[0];

  // Validate products + snapshot cost_price per item.
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
    // BR-03: unit price must be ≥ cost (gifts exempt — unitPrice=0 forced).
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

  // INSERT order header.
  const orderInserted = await tx
    .insert(orders)
    .values({
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

  // INSERT items — commission_rule_snapshot is NOT NULL in schema; Phase 3.0 stores {} placeholder.
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
    userId: claims.userId,
    username: claims.username,
    details: {
      clientId: input.clientId,
      itemCount: input.items.length,
      totalAmount,
    },
  });

  return getOrderById(tx as unknown as DbHandle, orderId);
}

export async function startPreparation(
  tx: DbTx,
  id: number,
  claims: { userId: number; username: string },
): Promise<OrderDto> {
  // Lock the row to serialize concurrent state transitions.
  const lockRes = await tx.execute(
    sql`SELECT id, status FROM orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  const rows = (lockRes as unknown as { rows?: Array<{ id: number; status: string }> }).rows ?? [];
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

  return getOrderById(tx as unknown as DbHandle, id);
}

export async function cancelOrder(
  tx: DbTx,
  id: number,
  input: CancelOrderInput,
  claims: { userId: number; username: string },
): Promise<OrderDto> {
  // Lock the order row.
  const lockRes = await tx.execute(
    sql`SELECT id, status FROM orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  const rows = (lockRes as unknown as { rows?: Array<{ id: number; status: string }> }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);
  const current = rows[0];
  if (current.status === "ملغي") {
    throw new ConflictError(
      "الطلب ملغى مسبقاً.",
      "ALREADY_CANCELLED",
      { id, status: current.status },
    );
  }

  // return_to_stock — lock each product row, add quantity back.
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

  // Update order status.
  await tx
    .update(orders)
    .set({
      status: "ملغي",
      updatedBy: claims.username,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));

  // Bonuses: Phase 3.0 no bonus rows exist (computed on delivery in Phase 4).
  // Intent recorded in cancellations row below; no DELETE on bonuses anywhere (D-04).

  // INSERT cancellations row (hash-chain also required — using same canonical form
  // as activity_log for consistency).
  const { canonicalJSON } = await import("@/lib/activity-log");
  const crypto = await import("node:crypto");
  const lastCancRes = await tx.execute(
    sql`SELECT row_hash FROM cancellations ORDER BY id DESC LIMIT 1`,
  );
  const lastCancRows = (lastCancRes as unknown as { rows?: Array<{ row_hash?: string }> }).rows ?? [];
  const cancPrevHash = lastCancRows.length > 0 ? lastCancRows[0].row_hash ?? null : null;
  const cancPayload = canonicalJSON({
    orderId: id,
    cancelledBy: claims.username,
    reason: input.reason,
    refundAmount: 0,
    returnToStock: input.returnToStock ? 1 : 0,
    sellerBonusAction: input.sellerBonusAction,
    driverBonusAction: input.driverBonusAction,
  });
  const cancRowHash = crypto
    .createHash("sha256")
    .update((cancPrevHash ?? "") + "|" + cancPayload, "utf8")
    .digest("hex");

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
    prevHash: cancPrevHash,
    rowHash: cancRowHash,
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

  return getOrderById(tx as unknown as DbHandle, id);
}
