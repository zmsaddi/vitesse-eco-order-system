import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { suppliers } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/lib/api-errors";
import { supplierRowToDto } from "./mappers";
import type { CreateSupplierInput, SupplierDto, UpdateSupplierPatch } from "./dto";

// D-68 + D-69: suppliers service.
// Soft-disable via `active` (H6 — never hard-deleted, keeps history intact).
//
// Dedup (Phase 2c.1, mirrors clients pattern):
//   - DB: partial UNIQUE on (name, phone) WHERE phone != '' AND deleted_at IS NULL
//     (02_DB_Tree.md + 36_Performance.md) — prevents alias credit splits.
//   - App: pre-check via assertNoDuplicate → friendly 409 DUPLICATE_SUPPLIER.
//   - Race: PG 23505 → mapUniqueViolation → same 409 shape. Belt + suspenders.

export type ListSuppliersOptions = {
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
};

export async function listSuppliers(
  db: DbHandle,
  opts: ListSuppliersOptions = {},
): Promise<{ rows: SupplierDto[]; total: number }> {
  const limit = clampLimit(opts.limit);
  const offset = Math.max(0, opts.offset ?? 0);

  const whereActive = opts.includeInactive
    ? isNull(suppliers.deletedAt)
    : and(eq(suppliers.active, true), isNull(suppliers.deletedAt));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(whereActive)
      .orderBy(asc(suppliers.name))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(suppliers).where(whereActive),
  ]);

  return { rows: rows.map(supplierRowToDto), total: Number(total) };
}

export async function getSupplierById(db: DbHandle, id: number): Promise<SupplierDto> {
  const rows = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(`المورد رقم ${id}`);
  return supplierRowToDto(row);
}

export async function createSupplier(
  tx: DbTx,
  input: CreateSupplierInput,
  _createdBy: string,
): Promise<SupplierDto> {
  void _createdBy; // tracked via activity_log in Phase 4
  await assertNoDuplicate(tx, { name: input.name, phone: input.phone }, null);

  try {
    const inserted = await tx.insert(suppliers).values(input).returning();
    return supplierRowToDto(inserted[0]);
  } catch (err) {
    throw mapUniqueViolation(err, { name: input.name, phone: input.phone });
  }
}

export async function updateSupplier(
  tx: DbTx,
  id: number,
  patch: UpdateSupplierPatch,
  updatedBy: string,
): Promise<SupplierDto> {
  const existing = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
    .limit(1);
  if (existing.length === 0) throw new NotFoundError(`المورد رقم ${id}`);

  const nextName = patch.name ?? existing[0].name;
  const nextPhone = patch.phone ?? existing[0].phone ?? "";
  if (patch.name !== undefined || patch.phone !== undefined) {
    await assertNoDuplicate(tx, { name: nextName, phone: nextPhone }, id);
  }

  try {
    const updated = await tx
      .update(suppliers)
      .set({ ...patch, updatedBy, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    return supplierRowToDto(updated[0]);
  } catch (err) {
    throw mapUniqueViolation(err, { name: nextName, phone: nextPhone });
  }
}

/**
 * App-level pre-check. Skips when phone is empty (partial index only fires when
 * phone != ''). Idempotent self-update supported via excludeId.
 */
async function assertNoDuplicate(
  tx: DbTx,
  input: { name: string; phone: string },
  excludeId: number | null,
): Promise<void> {
  if (input.phone.length === 0) return;

  const whereClause = and(
    isNull(suppliers.deletedAt),
    eq(suppliers.name, input.name),
    eq(suppliers.phone, input.phone),
    excludeId !== null ? ne(suppliers.id, excludeId) : undefined,
  );

  const matches = await tx.select().from(suppliers).where(whereClause).limit(1);
  if (matches.length > 0) {
    throw new ConflictError(
      `مورد بنفس الاسم والهاتف موجود مسبقاً (رقم ${matches[0].id})`,
      "DUPLICATE_SUPPLIER",
      { existingId: matches[0].id, axis: "phone" },
    );
  }
}

/**
 * Maps PG 23505 (unique_violation) on suppliers_name_phone_active_unique to a
 * ConflictError. Mirrors clients mapUniqueViolation; reads `constraint` (NOT
 * `constraint_name` — see Phase 2b.1.1 errata).
 */
export function mapUniqueViolation(
  err: unknown,
  input: { name: string; phone: string },
): unknown {
  const pgErr = err as { code?: string; constraint?: string } | null;
  if (!pgErr || pgErr.code !== "23505") return err;

  const constraint = pgErr.constraint ?? "";
  return new ConflictError(
    `مورد بنفس الاسم والهاتف موجود مسبقاً`,
    "DUPLICATE_SUPPLIER",
    {
      axis: "phone",
      constraint,
      dupeInput: { name: input.name, phone: input.phone },
    },
  );
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
function clampLimit(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_LIMIT;
  if (raw < 1) return DEFAULT_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(raw);
}
