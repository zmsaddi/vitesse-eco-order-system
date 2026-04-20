import { purchases } from "@/db/schema";
import { toNumber } from "@/lib/money";
import type { PurchaseDto } from "./dto";

type PurchaseRow = typeof purchases.$inferSelect;

export function purchaseRowToDto(row: PurchaseRow): PurchaseDto {
  return {
    id: row.id,
    refCode: row.refCode,
    date: row.date,
    supplierId: row.supplierId,
    supplierNameCached: row.supplierNameCached,
    productId: row.productId,
    itemNameCached: row.itemNameCached,
    category: row.category ?? "",
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unitPrice),
    total: toNumber(row.total),
    paymentMethod: row.paymentMethod,
    paidAmount: toNumber(row.paidAmount),
    paymentStatus: row.paymentStatus,
    notes: row.notes ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
