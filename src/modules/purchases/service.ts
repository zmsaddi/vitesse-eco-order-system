import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { products, purchases, suppliers } from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import { purchaseRowToDto } from "./mappers";
import type {
  CreatePurchaseInput,
  PurchaseDto,
  ReversePurchaseInput,
} from "./dto";

// D-68 + D-69: purchases service.
// createPurchase → weighted-avg update + stock += qty + activity_log.
// reversePurchase (C5) → soft-delete original, adjust product.stock/buy_price back,
//                         adjust supplier credit per reversalPath + activity_log.
// NO DELETE endpoint (D-04 / 35_API_Endpoints).

export async function getPurchaseById(
  db: DbHandle,
  id: number,
): Promise<PurchaseDto> {
  const rows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.id, id))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError(`المشترى رقم ${id}`);
  return purchaseRowToDto(rows[0]);
}

export async function createPurchase(
  tx: DbTx,
  input: CreatePurchaseInput,
  claims: { userId: number; username: string },
): Promise<PurchaseDto> {
  // Validate supplier (active + not soft-deleted).
  const supplierRows = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), isNull(suppliers.deletedAt)))
    .limit(1);
  if (supplierRows.length === 0 || !supplierRows[0].active) {
    throw new NotFoundError(`المورد رقم ${input.supplierId}`);
  }
  const supplier = supplierRows[0];

  // Lock the product row, read current stock + buy_price.
  const lockRes = await tx.execute(
    sql`SELECT id, name, category, stock, buy_price FROM products WHERE id = ${input.productId} AND active = true FOR UPDATE`,
  );
  const prodRows = (lockRes as unknown as {
    rows?: Array<{
      id: number;
      name: string;
      category: string;
      stock: string;
      buy_price: string;
    }>;
  }).rows ?? [];
  if (prodRows.length === 0) {
    throw new NotFoundError(`المنتج رقم ${input.productId}`);
  }
  const product = prodRows[0];

  const oldStock = Number(product.stock);
  const oldBuy = Number(product.buy_price);
  const addQty = input.quantity;
  const addCost = addQty * input.unitPrice;
  const newStock = oldStock + addQty;
  // Weighted-average new buy price: (oldStock*oldBuy + addQty*newUnit) / newStock.
  // If oldStock=0, newBuy is just the new unit price.
  const newBuy =
    newStock > 0 ? (oldStock * oldBuy + addCost) / newStock : oldBuy;

  const total = addCost;
  const paymentStatus =
    input.paidAmount >= total
      ? "paid"
      : input.paidAmount > 0
      ? "partial"
      : "pending";

  // INSERT purchase row.
  const inserted = await tx
    .insert(purchases)
    .values({
      date: input.date,
      supplierId: input.supplierId,
      supplierNameCached: supplier.name,
      productId: input.productId,
      itemNameCached: product.name,
      category: product.category,
      quantity: addQty.toFixed(2),
      unitPrice: input.unitPrice.toFixed(2),
      total: total.toFixed(2),
      paymentMethod: input.paymentMethod,
      paidAmount: input.paidAmount.toFixed(2),
      paymentStatus,
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning();
  const purchaseId = inserted[0].id;

  // Apply weighted-avg + stock bump (row already locked above).
  await tx
    .update(products)
    .set({
      stock: newStock.toFixed(2),
      buyPrice: newBuy.toFixed(2),
    })
    .where(eq(products.id, input.productId));

  // Supplier credit: if not fully paid, owed amount goes up on their side.
  if (input.paidAmount < total) {
    const owed = total - input.paidAmount;
    await tx.execute(
      sql`UPDATE suppliers SET credit_due_from_supplier = credit_due_from_supplier - ${owed.toFixed(2)} WHERE id = ${input.supplierId}`,
    );
    // Note: the balance field is named from the supplier's perspective.
    // Shop owes supplier = negative credit_due_from_supplier (consistent with D-62).
  }

  await logActivity(tx, {
    action: "create",
    entityType: "purchases",
    entityId: purchaseId,
    userId: claims.userId,
    username: claims.username,
    details: {
      supplierId: input.supplierId,
      productId: input.productId,
      quantity: addQty,
      total,
      oldBuy,
      newBuy,
      oldStock,
      newStock,
    },
  });

  return getPurchaseById(tx as unknown as DbHandle, purchaseId);
}

export async function reversePurchase(
  tx: DbTx,
  id: number,
  input: ReversePurchaseInput,
  claims: { userId: number; username: string },
): Promise<PurchaseDto> {
  // Lock the original purchase.
  const lockRes = await tx.execute(
    sql`SELECT id, product_id, supplier_id, quantity, total, paid_amount, deleted_at
        FROM purchases WHERE id = ${id} FOR UPDATE`,
  );
  const rows = (lockRes as unknown as {
    rows?: Array<{
      id: number;
      product_id: number;
      supplier_id: number;
      quantity: string;
      total: string;
      paid_amount: string;
      deleted_at: Date | null;
    }>;
  }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`المشترى رقم ${id}`);
  const original = rows[0];
  if (original.deleted_at !== null) {
    throw new ConflictError(
      "المشترى معكوس مسبقاً.",
      "ALREADY_REVERSED",
      { id },
    );
  }

  const qty = Number(original.quantity);
  const total = Number(original.total);
  const paid = Number(original.paid_amount);

  // Lock product + reverse stock bump (DO NOT adjust buy_price here — weighted-avg is
  // path-dependent; formal historical price is logged in price_history — D-58 — which
  // is a later-tranche concern. For Phase 3.0 we simply revert quantity delta.)
  const prodLock = await tx.execute(
    sql`SELECT id, stock FROM products WHERE id = ${original.product_id} FOR UPDATE`,
  );
  const prodRows = (prodLock as unknown as { rows?: Array<{ id: number; stock: string }> }).rows ?? [];
  if (prodRows.length === 0) {
    throw new NotFoundError(`المنتج رقم ${original.product_id}`);
  }
  const newStock = Number(prodRows[0].stock) - qty;
  if (newStock < 0) {
    throw new BusinessRuleError(
      "لا يمكن عكس هذه المشترى لأن المخزون الحالي أقل من الكمية المستوردة.",
      "STOCK_UNDERFLOW",
      400,
      undefined,
      { productId: original.product_id, currentStock: Number(prodRows[0].stock), qty },
    );
  }
  await tx
    .update(products)
    .set({ stock: newStock.toFixed(2) })
    .where(eq(products.id, original.product_id));

  // Supplier credit adjustment per reversalPath.
  if (input.reversalPath === "refund_cash") {
    // If we paid cash, cash comes back; supplier no longer owed the unpaid portion either.
    // Net supplier-balance change: if there was outstanding owed (total - paid), cancel it.
    const owedBefore = total - paid;
    if (owedBefore > 0) {
      await tx.execute(
        sql`UPDATE suppliers SET credit_due_from_supplier = credit_due_from_supplier + ${owedBefore.toFixed(2)} WHERE id = ${original.supplier_id}`,
      );
    }
  } else {
    // supplier_credit: full total becomes a credit the supplier owes us.
    await tx.execute(
      sql`UPDATE suppliers SET credit_due_from_supplier = credit_due_from_supplier + ${total.toFixed(2)} WHERE id = ${original.supplier_id}`,
    );
  }

  // Soft-delete the original purchase (D-04: no DELETE; partial unique on reversal is
  // in expenses domain, not here — purchases uses soft-delete + activity_log trail).
  await tx
    .update(purchases)
    .set({
      deletedAt: new Date(),
      deletedBy: claims.username,
      updatedBy: claims.username,
      updatedAt: new Date(),
      notes: sql`COALESCE(${purchases.notes}, '') || ' | reversed: ' || ${input.reason}`,
    })
    .where(eq(purchases.id, id));

  await logActivity(tx, {
    action: "reverse",
    entityType: "purchases",
    entityId: id,
    userId: claims.userId,
    username: claims.username,
    details: {
      reason: input.reason,
      reversalPath: input.reversalPath,
      qty,
      total,
      paid,
    },
  });

  return getPurchaseById(tx as unknown as DbHandle, id);
}
