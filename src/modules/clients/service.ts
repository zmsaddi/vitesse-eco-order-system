import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { clients } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/lib/api-errors";
import { clientRowToDto } from "./mappers";
import type { ClientDto, CreateClientInput, UpdateClientInput } from "./dto";

// D-68 + D-69 + D-20: service layer for clients domain.
// Soft-delete-only (D-04); partial UNIQUE on (name, phone) where phone != '' and deleted_at is null.

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

export async function createClient(
  tx: DbTx,
  input: CreateClientInput,
  createdBy: string,
): Promise<ClientDto> {
  // Duplicate guard (partial index covers phone != ''; we still check app-side to
  // give a friendly code before hitting DB constraint).
  if (input.phone) {
    const existing = await tx
      .select()
      .from(clients)
      .where(
        and(eq(clients.name, input.name), eq(clients.phone, input.phone), isNull(clients.deletedAt)),
      )
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError(
        `عميل بنفس الاسم والهاتف موجود مسبقاً (رقم ${existing[0].id})`,
        "DUPLICATE_CLIENT",
        { existingId: existing[0].id },
      );
    }
  }

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
}

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
}

// Helpers
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
function clampLimit(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_LIMIT;
  if (raw < 1) return DEFAULT_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(raw);
}
