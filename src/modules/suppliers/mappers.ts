import { suppliers } from "@/db/schema";
import { toNumber } from "@/lib/money";
import type { SupplierDto } from "./dto";

type SupplierRow = typeof suppliers.$inferSelect;

export function supplierRowToDto(row: SupplierRow): SupplierDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    address: row.address ?? "",
    notes: row.notes ?? "",
    creditDueFromSupplier: toNumber(row.creditDueFromSupplier),
    active: row.active,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}
