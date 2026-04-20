import { deliveries } from "@/db/schema";
import type { DeliveryDto } from "./dto";

type DeliveryRow = typeof deliveries.$inferSelect;

export function deliveryRowToDto(row: DeliveryRow): DeliveryDto {
  return {
    id: row.id,
    refCode: row.refCode,
    date: row.date,
    orderId: row.orderId,
    clientId: row.clientId,
    clientNameCached: row.clientNameCached,
    clientPhoneCached: row.clientPhoneCached ?? "",
    address: row.address ?? "",
    status: row.status,
    assignedDriverId: row.assignedDriverId ?? null,
    assignedDriverUsernameCached: row.assignedDriverUsernameCached ?? "",
    notes: row.notes ?? "",
    confirmationDate: row.confirmationDate?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
