import { orders, orderItems } from "@/db/schema";
import { toNumber } from "@/lib/money";
import type { OrderDto, OrderItemDto } from "./dto";

type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

export function orderItemRowToDto(row: OrderItemRow): OrderItemDto {
  const discountType = (row.discountType ?? null) as "percent" | "fixed" | null;
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    productNameCached: row.productNameCached,
    category: row.category ?? "",
    quantity: toNumber(row.quantity),
    recommendedPrice: toNumber(row.recommendedPrice),
    unitPrice: toNumber(row.unitPrice),
    costPrice: toNumber(row.costPrice),
    discountType,
    discountValue: row.discountValue != null ? toNumber(row.discountValue) : null,
    lineTotal: toNumber(row.lineTotal),
    isGift: row.isGift,
    vin: row.vin ?? "",
    commissionRuleSnapshot:
      (row.commissionRuleSnapshot as Record<string, unknown> | null) ?? {},
  };
}

export function orderRowToDto(row: OrderRow, items: OrderItemRow[]): OrderDto {
  return {
    id: row.id,
    refCode: row.refCode,
    date: row.date,
    clientId: row.clientId,
    clientNameCached: row.clientNameCached,
    clientPhoneCached: row.clientPhoneCached ?? "",
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    totalAmount: toNumber(row.totalAmount),
    advancePaid: toNumber(row.advancePaid),
    notes: row.notes ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    items: items.map(orderItemRowToDto),
  };
}
