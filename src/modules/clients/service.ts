import { and, asc, count, eq, isNull, ne, or } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { clients } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/lib/api-errors";
import { clientRowToDto } from "./mappers";
import type { ClientDto, CreateClientInput, UpdateClientInput } from "./dto";

// D-68 + D-69 + D-20: service layer for clients domain.
// Soft-delete-only (D-04); partial UNIQUE indexes on (name,phone) and (name,email)
// where the contact field is non-empty AND deleted_at IS NULL — defined in
// src/db/schema/clients-suppliers.ts + migration 0003_clients_dedup_indexes.sql.
//
// Duplicate handling (Phase 2b.1, race-safe):
//   1. App-level pre-check catches the common case early with a friendly code +
//      an `existingId` payload for UX (e.g. "go to existing record").
//   2. PG 23505 (unique_violation) is caught at the DB boundary and mapped to the
//      same ConflictError. Covers races the pre-check can't (two concurrent INSERTs
//      that both pass the pre-check).
// Both layers throw `DUPLICATE_CLIENT` so downstream handlers see one consistent code.

// ───────────────────── list + get ─────────────────────

export type ListClientsOptions = {
  limit?: number;
  offset?: number;
};

export async function listActiveClients(
  db: DbHandle,
  opts: ListClientsOptions = {},
): Promise<{ rows: ClientDto[]; total: number }> {
  const limit = clampLimit(opts.limit);
  const offset = Math.max(0, opts.offset ?? 0);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(isNull(clients.deletedAt))
      .orderBy(asc(clients.name))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(clients)
      .where(isNull(clients.deletedAt)),
  ]);

  return { rows: rows.map(clientRowToDto), total: Number(total) };
}

export async function getClientById(db: DbHandle, id: number): Promise<ClientDto> {
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(`العميل رقم ${id}`);
  return clientRowToDto(row);
}

// ───────────────────── create ─────────────────────

export async function createClient(
  tx: DbTx,
  input: CreateClientInput,
  createdBy: string,
): Promise<ClientDto> {
  await assertNoDuplicate(tx, input, /* excludeId */ null);

  try {
    const inserted = await tx
      .insert(clients)
      .values({
        name: input.name,
        latinName: input.latinName,
        phone: input.phone,
        email: input.email,
        address: input.address,
        descriptionAr: input.descriptionAr,
        notes: input.notes,
        createdBy,
      })
      .returning();
    return clientRowToDto(inserted[0]);
  } catch (err) {
    throw mapUniqueViolation(err, input);
  }
}

// ───────────────────── update ─────────────────────

export async function updateClient(
  tx: DbTx,
  id: number,
  input: UpdateClientInput,
  updatedBy: string,
): Promise<ClientDto> {
  const existing = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
    .limit(1);
  if (existing.length === 0) throw new NotFoundError(`العميل رقم ${id}`);

  // Pre-check: duplicate against OTHER rows only. Idempotent update on self must succeed.
  await assertNoDuplicate(tx, input, /* excludeId */ id);

  try {
    const updated = await tx
      .update(clients)
      .set({
        name: input.name,
        latinName: input.latinName,
        phone: input.phone,
        email: input.email,
        address: input.address,
        descriptionAr: input.descriptionAr,
        notes: input.notes,
        updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, id))
      .returning();
    return clientRowToDto(updated[0]);
  } catch (err) {
    throw mapUniqueViolation(err, input);
  }
}

// ───────────────────── duplicate guards ─────────────────────

/**
 * App-level pre-check — throws ConflictError if another active client has the
 * same (name, phone) OR same (name, email). Excludes `excludeId` (update-on-self).
 * Skips the phone check when `phone` is empty (partial index only applies when phone != '').
 * Skips the email check when `email` is empty — same reason.
 */
async function assertNoDuplicate(
  tx: DbTx,
  input: Pick<CreateClientInput, "name" | "phone" | "email">,
  excludeId: number | null,
): Promise<void> {
  const hasPhone = input.phone.length > 0;
  const hasEmail = input.email.length > 0;
  if (!hasPhone && !hasEmail) return; // nothing to check

  const conditions = [];
  if (hasPhone) {
    conditions.push(and(eq(clients.name, input.name), eq(clients.phone, input.phone)));
  }
  if (hasEmail) {
    conditions.push(and(eq(clients.name, input.name), eq(clients.email, input.email)));
  }

  const whereClause = and(
    isNull(clients.deletedAt),
    or(...conditions),
    excludeId !== null ? ne(clients.id, excludeId) : undefined,
  );

  const matches = await tx.select().from(clients).where(whereClause).limit(1);
  if (matches.length > 0) {
    const match = matches[0];
    // Identify which axis matched for a precise message.
    let axis: "phone" | "email";
    if (hasPhone && match.phone === input.phone) axis = "phone";
    else axis = "email";
    throw new ConflictError(
      axis === "phone"
        ? `عميل بنفس الاسم والهاتف موجود مسبقاً (رقم ${match.id})`
        : `عميل بنفس الاسم والبريد الإلكتروني موجود مسبقاً (رقم ${match.id})`,
      "DUPLICATE_CLIENT",
      { existingId: match.id, axis },
    );
  }
}

/**
 * Maps a Postgres unique_violation (SQLSTATE 23505) to a ConflictError.
 * Race-safe last line of defense when two concurrent transactions both pass
 * the app-level pre-check and one loses at the DB index.
 */
function mapUniqueViolation(
  err: unknown,
  input: Pick<CreateClientInput, "name" | "phone" | "email">,
): unknown {
  const pgErr = err as { code?: string; constraint_name?: string; message?: string } | null;
  if (!pgErr || pgErr.code !== "23505") return err;

  const constraint = pgErr.constraint_name ?? "";
  let axis: "phone" | "email" = "phone";
  let userMsg = `عميل بنفس الاسم والهاتف موجود مسبقاً`;
  if (constraint.includes("email")) {
    axis = "email";
    userMsg = `عميل بنفس الاسم والبريد الإلكتروني موجود مسبقاً`;
  }
  return new ConflictError(userMsg, "DUPLICATE_CLIENT", {
    axis,
    constraint,
    // existingId unknown from error alone; UX can re-query by (name, phone/email) if it needs it.
    dupeInput: { name: input.name, [axis]: input[axis] },
  });
}

// ───────────────────── helpers ─────────────────────

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
function clampLimit(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_LIMIT;
  if (raw < 1) return DEFAULT_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(raw);
}
