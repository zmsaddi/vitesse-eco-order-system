import type { treasuryAccounts, treasuryMovements } from "@/db/schema";
import type { TreasuryAccountDto, TreasuryMovementDto } from "./dto";

type AccountRow = typeof treasuryAccounts.$inferSelect;
type MovementRow = typeof treasuryMovements.$inferSelect;

export function treasuryAccountRowToDto(row: AccountRow): TreasuryAccountDto {
  return {
    id: row.id,
    type: row.type as TreasuryAccountDto["type"],
    name: row.name,
    ownerUserId: row.ownerUserId ?? null,
    parentAccountId: row.parentAccountId ?? null,
    balance: row.balance,
    active: row.active === 1,
    createdAt: row.createdAt.toISOString(),
  };
}

export function treasuryMovementRowToDto(row: MovementRow): TreasuryMovementDto {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    fromAccountId: row.fromAccountId ?? null,
    toAccountId: row.toAccountId ?? null,
    amount: row.amount,
    referenceType: row.referenceType ?? null,
    referenceId: row.referenceId ?? null,
    notes: row.notes ?? "",
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
