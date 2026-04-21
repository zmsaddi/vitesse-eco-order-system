import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { users } from "@/db/schema";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/api-errors";
import { hashPassword } from "@/lib/password";
import { userRowToDto } from "./mappers";
import {
  ensureDriverCustody,
  ensureManagerBox,
  validateManagerLink,
} from "./treasury-wiring";
import type { CreateUserInput, UserDto } from "./dto";

// Phase 4.2 — validate that an active driver has a managerId. Called on
// create and update. Inactive drivers are grandfathered (legacy rows).
function assertDriverManagerRequired(
  role: string,
  active: boolean,
  managerId: number | null,
): void {
  if (role === "driver" && active && managerId == null) {
    throw new BusinessRuleError(
      "السائقون النشطون يجب أن يكونوا مرتبطين بمدير.",
      "DRIVER_MANAGER_REQUIRED",
      400,
      "active driver user must carry a non-null manager_id",
      { role, active },
    );
  }
}

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

  // Phase 4.2 — validate manager_id rules BEFORE any write so on failure the
  // tx rolls back zero state.
  assertDriverManagerRequired(input.role, true, input.managerId);
  if (input.managerId != null) {
    await validateManagerLink(tx, input.managerId);
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
      managerId: input.managerId ?? null,
    })
    .returning();
  const row = inserted[0];

  // Phase 4.2 — idempotent treasury wiring for new user. Never creates
  // duplicates on repeat or on downstream path where the account already
  // exists (e.g., backfill migration ran first).
  if (row.role === "manager") {
    await ensureManagerBox(tx, row.id, row.name);
  } else if (row.role === "driver" && row.managerId != null) {
    await ensureDriverCustody(tx, row.id, row.name, row.managerId);
  }

  // `createdBy` is informational here — users table doesn't carry creator today;
  // that's surfaced via activity_log once Phase 4 wires it.
  void createdBy;
  return userRowToDto(row);
}

export type UpdateUserInput = {
  name?: string;
  role?: UserDto["role"];
  active?: boolean;
  profitSharePct?: number;
  profitShareStart?: string | null;
  managerId?: number | null;
};

export async function updateUser(
  tx: DbTx,
  id: number,
  patch: UpdateUserInput,
  updatedBy: string,
): Promise<UserDto> {
  const existing = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) throw new NotFoundError(`المستخدم رقم ${id}`);
  const before = existing[0];

  const patchValues: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) patchValues.name = patch.name;
  if (patch.role !== undefined) patchValues.role = patch.role;
  if (patch.active !== undefined) patchValues.active = patch.active;
  if (patch.profitSharePct !== undefined) patchValues.profitSharePct = patch.profitSharePct.toFixed(2);
  if (patch.profitShareStart !== undefined) patchValues.profitShareStart = patch.profitShareStart;
  if (patch.managerId !== undefined) patchValues.managerId = patch.managerId;

  // Phase 4.2 — compute the post-patch effective values to validate driver/
  // manager invariants BEFORE writing. If the patch doesn't touch a field,
  // fall back to the current row value.
  const effectiveRole = patch.role ?? before.role;
  const effectiveActive = patch.active ?? before.active;
  const effectiveManagerId =
    patch.managerId !== undefined ? patch.managerId : before.managerId;

  assertDriverManagerRequired(effectiveRole, effectiveActive, effectiveManagerId);
  if (patch.managerId != null) {
    await validateManagerLink(tx, patch.managerId);
  }

  // `updatedBy` not tracked on users schema directly — activity_log carries it (Phase 4).
  void updatedBy;

  const updated = await tx.update(users).set(patchValues).where(eq(users.id, id)).returning();
  const row = updated[0];

  // Phase 4.2 idempotent treasury-wiring on update:
  //   - role became 'manager' OR name/manager row already manager ⇒ ensure box.
  //   - role='driver' and active with managerId ⇒ ensure + rebind custody.
  //   - Role drop / active=false ⇒ DO NOT delete or modify accounts. Ops are
  //     gated elsewhere (bridge + handover check role/active/manager_id).
  if (row.role === "manager") {
    await ensureManagerBox(tx, row.id, row.name);
  }
  if (row.role === "driver" && row.active && row.managerId != null) {
    await ensureDriverCustody(tx, row.id, row.name, row.managerId);
  }

  return userRowToDto(row);
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
