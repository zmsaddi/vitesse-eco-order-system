import { driverTasks } from "@/db/schema";
import { toNumber } from "@/lib/money";
import type { DriverTaskDto } from "./dto";

type DriverTaskRow = typeof driverTasks.$inferSelect;

export function driverTaskRowToDto(row: DriverTaskRow): DriverTaskDto {
  return {
    id: row.id,
    type: row.type as DriverTaskDto["type"],
    status: row.status as DriverTaskDto["status"],
    assignedDriverId: row.assignedDriverId,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    amountHint: row.amountHint != null ? toNumber(row.amountHint) : null,
    notes: row.notes ?? "",
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
