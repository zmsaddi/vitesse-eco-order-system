import { expenses } from "@/db/schema";
import { toNumber } from "@/lib/money";
import type { ExpenseDto } from "./dto";

type ExpenseRow = typeof expenses.$inferSelect;

export function expenseRowToDto(row: ExpenseRow): ExpenseDto {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    description: row.description,
    amount: toNumber(row.amount),
    paymentMethod: row.paymentMethod,
    comptableClass: row.comptableClass ?? null,
    notes: row.notes ?? "",
    reversalOf: row.reversalOf ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
