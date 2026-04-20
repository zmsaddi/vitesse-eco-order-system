import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { expenses } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import { expenseRowToDto } from "./mappers";
import type {
  CreateExpenseInput,
  ExpenseDto,
  ReverseExpenseInput,
  UpdateExpenseInput,
} from "./dto";

// D-82 / D-04: expenses service — no DELETE; corrections go through reverseExpense.

export async function listExpenses(
  db: DbHandle,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: ExpenseDto[]; total: number }> {
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const filter = isNull(expenses.deletedAt);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(filter)
      .orderBy(asc(expenses.date))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(expenses).where(filter),
  ]);
  return { rows: rows.map(expenseRowToDto), total: Number(total) };
}

export async function getExpenseById(db: DbHandle, id: number): Promise<ExpenseDto> {
  const rows = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (rows.length === 0) throw new NotFoundError(`المصروف رقم ${id}`);
  return expenseRowToDto(rows[0]);
}

export async function createExpense(
  tx: DbTx,
  input: CreateExpenseInput,
  claims: { userId: number; username: string },
): Promise<ExpenseDto> {
  const inserted = await tx
    .insert(expenses)
    .values({
      date: input.date,
      category: input.category,
      description: input.description,
      amount: input.amount.toFixed(2),
      paymentMethod: input.paymentMethod,
      comptableClass: input.comptableClass,
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning();

  await logActivity(tx, {
    action: "create",
    entityType: "expenses",
    entityId: inserted[0].id,
    userId: claims.userId,
    username: claims.username,
    details: {
      amount: input.amount,
      category: input.category,
      paymentMethod: input.paymentMethod,
    },
  });

  return expenseRowToDto(inserted[0]);
}

export async function updateExpense(
  tx: DbTx,
  id: number,
  input: UpdateExpenseInput,
  claims: { userId: number; username: string },
): Promise<ExpenseDto> {
  const existing = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
    .limit(1);
  if (existing.length === 0) throw new NotFoundError(`المصروف رقم ${id}`);

  const patchValues: Partial<typeof expenses.$inferInsert> = {
    updatedBy: claims.username,
    updatedAt: new Date(),
  };
  if (input.date !== undefined) patchValues.date = input.date;
  if (input.category !== undefined) patchValues.category = input.category;
  if (input.description !== undefined) patchValues.description = input.description;
  if (input.amount !== undefined) patchValues.amount = input.amount.toFixed(2);
  if (input.paymentMethod !== undefined) patchValues.paymentMethod = input.paymentMethod;
  if (input.comptableClass !== undefined) patchValues.comptableClass = input.comptableClass;
  if (input.notes !== undefined) patchValues.notes = input.notes;

  const updated = await tx
    .update(expenses)
    .set(patchValues)
    .where(eq(expenses.id, id))
    .returning();

  await logActivity(tx, {
    action: "update",
    entityType: "expenses",
    entityId: id,
    userId: claims.userId,
    username: claims.username,
    details: { fields: Object.keys(input) },
  });

  return expenseRowToDto(updated[0]);
}

export async function reverseExpense(
  tx: DbTx,
  id: number,
  input: ReverseExpenseInput,
  claims: { userId: number; username: string },
): Promise<ExpenseDto> {
  // Lock the original row.
  const lockRes = await tx.execute(
    sql`SELECT id, date, category, description, amount, payment_method, comptable_class, reversal_of, deleted_at
        FROM expenses WHERE id = ${id} FOR UPDATE`,
  );
  const rows = (lockRes as unknown as {
    rows?: Array<{
      id: number;
      date: string;
      category: string;
      description: string;
      amount: string;
      payment_method: string;
      comptable_class: string | null;
      reversal_of: number | null;
      deleted_at: Date | null;
    }>;
  }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`المصروف رقم ${id}`);
  const original = rows[0];

  if (original.deleted_at !== null) {
    throw new ConflictError(
      "لا يمكن عكس مصروف محذوف.",
      "EXPENSE_DELETED",
      { id },
    );
  }
  if (original.reversal_of !== null) {
    throw new ConflictError(
      "لا يمكن عكس صف عكسي بنفسه.",
      "CANNOT_REVERSE_REVERSAL",
      { id, originalReversalOf: original.reversal_of },
    );
  }

  // Pre-check for an existing active reversal of this row. Partial unique index
  // (expenses_one_reversal_per_original) is the race-safe backstop; the pre-check
  // turns the common case into a friendly ConflictError without depending on the
  // driver exposing `.constraint` on a 23505 (which is not reliable across the
  // Drizzle wrapper + @neondatabase/serverless error shapes).
  const existingReversal = await tx
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.reversalOf, id), isNull(expenses.deletedAt)))
    .limit(1);
  if (existingReversal.length > 0) {
    throw new ConflictError(
      "هذا المصروف معكوس مسبقاً.",
      "ALREADY_REVERSED",
      { originalId: id, existingReversalId: existingReversal[0].id },
    );
  }

  const originalAmount = Number(original.amount);
  const reversedAmount = -originalAmount;

  // INSERT reversal row. The partial unique index still fires on races (two tx's
  // both past the pre-check). On 23505 from that index we surface ALREADY_REVERSED.
  let inserted;
  try {
    inserted = await tx
      .insert(expenses)
      .values({
        date: original.date,
        category: original.category,
        description: `عكس: ${original.description}`,
        amount: reversedAmount.toFixed(2),
        paymentMethod: original.payment_method,
        comptableClass: original.comptable_class,
        notes: input.reason,
        reversalOf: id,
        createdBy: claims.username,
      })
      .returning();
  } catch (err) {
    // Defensive: drizzle may wrap the pg error, so check both top-level and .cause.
    const e = err as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    } | null;
    const code = e?.code ?? e?.cause?.code;
    const constraint = e?.constraint ?? e?.cause?.constraint ?? "";
    if (code === "23505") {
      throw new ConflictError(
        "هذا المصروف معكوس مسبقاً.",
        "ALREADY_REVERSED",
        { originalId: id, constraint },
      );
    }
    throw err;
  }

  await logActivity(tx, {
    action: "reverse",
    entityType: "expenses",
    entityId: inserted[0].id,
    userId: claims.userId,
    username: claims.username,
    details: {
      originalExpenseId: id,
      originalAmount,
      reversedAmount,
      reason: input.reason,
    },
  });

  return expenseRowToDto(inserted[0]);
}
