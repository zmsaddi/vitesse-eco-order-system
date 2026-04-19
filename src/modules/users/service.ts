import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { users } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/lib/api-errors";
import { hashPassword } from "@/lib/password";
import { userRowToDto } from "./mappers";
import type { CreateUserInput, UserDto } from "./dto";

// D-68 + D-69: domain service. Accepts a DbHandle (read) or DbTx (write).
// Route handlers stay thin; this service encapsulates business logic.

export async function getUserByUsername(db: DbHandle, username: string): Promise<UserDto> {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(`المستخدم ${username}`);
  return userRowToDto(row);
}

export async function getUserById(db: DbHandle, id: number): Promise<UserDto> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(`المستخدم رقم ${id}`);
  return userRowToDto(row);
}

export type ListUsersOptions = {
  limit?: number;
  offset?: number;
  /** When true, include disabled (active=false) users. Default: active only. */
  includeInactive?: boolean;
};

/**
 * Paginated users list — Phase 2b.
 * Default limit 50, max 1000. Returns { rows, total, limit, offset }.
 */
export async function listUsersPaginated(
  db: DbHandle,
  opts: ListUsersOptions = {},
): Promise<{ rows: UserDto[]; total: number; limit: number; offset: number }> {
  const limit = clampLimit(opts.limit);
  const offset = Math.max(0, opts.offset ?? 0);
  const filter = opts.includeInactive ? undefined : eq(users.active, true);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(filter)
      .orderBy(asc(users.username))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(filter),
  ]);

  return { rows: rows.map(userRowToDto), total: Number(total), limit, offset };
}

/**
 * Backwards-compatible alias used by Phase 2 /users page + /api/v1/me.
 * Returns up to 1000 active users in one shot (no pagination pressure yet).
 */
export async function listActiveUsers(db: DbHandle): Promise<UserDto[]> {
  const { rows } = await listUsersPaginated(db, { limit: 1000 });
  return rows;
}

export async function createUser(
  tx: DbTx,
  input: CreateUserInput,
  createdBy: string,
): Promise<UserDto> {
  // Username uniqueness (schema has UNIQUE; we pre-check for a friendly code).
  const existing = await tx
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);
  if (existing.length > 0) {
    throw new ConflictError(
      "اسم المستخدم موجود مسبقاً. اختر اسماً آخر.",
      "DUPLICATE_USERNAME",
      { existingId: existing[0].id },
    );
  }

  const passwordHash = await hashPassword(input.password);
  const inserted = await tx
    .insert(users)
    .values({
      username: input.username,
      password: passwordHash,
      name: input.name,
      role: input.role,
      active: true,
      profitSharePct: input.profitSharePct.toFixed(2),
      profitShareStart: input.profitShareStart ?? null,
    })
    .returning();
  // `createdBy` is informational here — users table doesn't carry creator today;
  // that's surfaced via activity_log once Phase 4 wires it.
  void createdBy;
  return userRowToDto(inserted[0]);
}

export type UpdateUserInput = {
  name?: string;
  role?: UserDto["role"];
  active?: boolean;
  profitSharePct?: number;
  profitShareStart?: string | null;
};

export async function updateUser(
  tx: DbTx,
  id: number,
  patch: UpdateUserInput,
  updatedBy: string,
): Promise<UserDto> {
  const existing = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) throw new NotFoundError(`المستخدم رقم ${id}`);

  const patchValues: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) patchValues.name = patch.name;
  if (patch.role !== undefined) patchValues.role = patch.role;
  if (patch.active !== undefined) patchValues.active = patch.active;
  if (patch.profitSharePct !== undefined) patchValues.profitSharePct = patch.profitSharePct.toFixed(2);
  if (patch.profitShareStart !== undefined) patchValues.profitShareStart = patch.profitShareStart;
  // `updatedBy` not tracked on users schema directly — activity_log carries it (Phase 4).
  void updatedBy;

  const updated = await tx.update(users).set(patchValues).where(eq(users.id, id)).returning();
  return userRowToDto(updated[0]);
}

/**
 * Mark the current user as onboarded (D-49). Idempotent — only writes when
 * onboardedAt IS NULL, so repeated calls never overwrite the original timestamp.
 */
export async function markOnboarded(tx: DbTx, userId: number): Promise<void> {
  await tx
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.onboardedAt)));
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
function clampLimit(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_LIMIT;
  if (raw < 1) return DEFAULT_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(raw);
}
