import { and, eq, isNull } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { users } from "@/db/schema";
import { NotFoundError } from "@/lib/api-errors";
import { userRowToDto } from "./mappers";
import type { UserDto } from "./dto";

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

export async function listActiveUsers(db: DbHandle): Promise<UserDto[]> {
  const rows = await db.select().from(users).where(eq(users.active, true));
  return rows.map(userRowToDto);
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
