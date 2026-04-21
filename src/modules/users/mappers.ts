import { users } from "@/db/schema";
import { toNumber } from "@/lib/money";
import type { UserDto } from "./dto";

// D-69: mappers يعزلون Drizzle row shape عن DTO shape.
// Never return Drizzle row directly from a route handler — always map first.

type UserRow = typeof users.$inferSelect;

export function userRowToDto(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role as UserDto["role"],
    active: row.active,
    profitSharePct: toNumber(row.profitSharePct),
    profitShareStart: row.profitShareStart ?? null,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    managerId: row.managerId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
