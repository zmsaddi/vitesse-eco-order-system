import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { suppliers } from "@/db/schema";
import { NotFoundError } from "@/lib/api-errors";
import { supplierRowToDto } from "./mappers";
import type { CreateSupplierInput, SupplierDto, UpdateSupplierPatch } from "./dto";

// D-68 + D-69: suppliers service.
// Soft-disable via `active` (H6 — never hard-deleted, keeps history intact).
// No unique index on (name, phone) yet — suppliers don't currently have the
// collision risk clients do (spec §30_Data_Integrity doesn't mandate it for suppliers).
// If a future phase adds one, mirror the clients dedup pattern.

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

  // Active-only by default; respects soft-delete (deletedAt) too.
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
  const inserted = await tx.insert(suppliers).values(input).returning();
  return supplierRowToDto(inserted[0]);
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

  const updated = await tx
    .update(suppliers)
    .set({ ...patch, updatedBy, updatedAt: new Date() })
    .where(eq(suppliers.id, id))
    .returning();
  return supplierRowToDto(updated[0]);
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
function clampLimit(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_LIMIT;
  if (raw < 1) return DEFAULT_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(raw);
}
