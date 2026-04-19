import { products } from "@/db/schema";
import { toNumber } from "@/lib/money";
import type { ProductDto } from "./dto";

type ProductRow = typeof products.$inferSelect;

export function productRowToDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? "",
    unit: row.unit ?? "",
    buyPrice: toNumber(row.buyPrice),
    sellPrice: toNumber(row.sellPrice),
    stock: toNumber(row.stock),
    lowStockThreshold: row.lowStockThreshold,
    active: row.active,
    descriptionAr: row.descriptionAr ?? "",
    descriptionLong: row.descriptionLong ?? "",
    specs: (row.specs as Record<string, unknown>) ?? {},
    catalogVisible: row.catalogVisible,
    notes: row.notes ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}
