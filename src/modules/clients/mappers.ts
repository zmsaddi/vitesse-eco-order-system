import { clients } from "@/db/schema";
import type { ClientDto } from "./dto";

type ClientRow = typeof clients.$inferSelect;

export function clientRowToDto(row: ClientRow): ClientDto {
  return {
    id: row.id,
    name: row.name,
    latinName: row.latinName ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    descriptionAr: row.descriptionAr ?? "",
    notes: row.notes ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
