import { and, eq, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { treasuryAccounts } from "@/db/schema";

// Phase 4.2 — low-level treasury account helpers shared by handover.ts and
// bridge.ts. Everything in this file is transactional (DbTx) and issues
// FOR UPDATE locks where required. Kept in its own file so service.ts stays
// under the 300-line cap.

export type LockedAccount = {
  id: number;
  type: string;
  owner_user_id: number | null;
  balance: string;
};

export async function lockAccountForUpdate(
  tx: DbTx,
  id: number,
): Promise<LockedAccount | null> {
  const res = await tx.execute(
    sql`SELECT id, type, owner_user_id, balance
        FROM treasury_accounts WHERE id = ${id} FOR UPDATE`,
  );
  const rows = (res as unknown as { rows?: Array<LockedAccount> }).rows ?? [];
  return rows[0] ?? null;
}

export async function findAccountByOwnerAndType(
  tx: DbTx,
  ownerUserId: number,
  type: string,
): Promise<{ id: number } | null> {
  const rows = await tx
    .select({ id: treasuryAccounts.id })
    .from(treasuryAccounts)
    .where(
      and(
        eq(treasuryAccounts.ownerUserId, ownerUserId),
        eq(treasuryAccounts.type, type),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function parseNumeric(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`invalid numeric: ${v}`);
  return n;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parisIsoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
