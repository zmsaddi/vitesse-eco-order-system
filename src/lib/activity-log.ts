import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { activityLog } from "@/db/schema";
import {
  canonicalJSON,
  computeHashChainLink,
  HASH_CHAIN_KEYS,
} from "./hash-chain";

// D-80 (Phase 3.0.1): activity_log write path now delegates the advisory-lock +
// prev-hash read + row-hash computation to the shared hash-chain helper. Direct
// INSERT on activity_log is forbidden; same table name + chain key are registered
// in HASH_CHAIN_KEYS so the helper can hard-verify the call.

// Re-export for callers that prefer the old import path.
export { canonicalJSON } from "./hash-chain";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "confirm"
  | "collect"
  | "login"
  | "logout"
  | "reverse";

export type ActivityLogEntry = {
  action: ActivityAction;
  entityType: string;
  entityId?: number | null;
  entityRefCode?: string | null;
  userId?: number | null;
  username: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

function canonicalForActivity(entry: ActivityLogEntry, timestampIso: string): string {
  return (
    canonicalJSON({
      action: entry.action,
      details: entry.details ?? null,
      entityId: entry.entityId ?? null,
      entityRefCode: entry.entityRefCode ?? null,
      entityType: entry.entityType,
      ipAddress: entry.ipAddress ?? null,
      userId: entry.userId ?? null,
      username: entry.username,
    }) +
    "|" +
    timestampIso
  );
}

/**
 * Write one activity_log row with a valid hash-chain link.
 * MUST be called inside an open transaction.
 */
export async function logActivity(tx: DbTx, entry: ActivityLogEntry): Promise<void> {
  const now = new Date();
  const timestampIso = now.toISOString();

  const { prevHash, rowHash } = await computeHashChainLink(
    tx,
    { chainLockKey: HASH_CHAIN_KEYS.activity_log, tableName: "activity_log" },
    canonicalForActivity(entry, timestampIso),
  );

  await tx.insert(activityLog).values({
    timestamp: now,
    userId: entry.userId ?? null,
    username: entry.username,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityRefCode: entry.entityRefCode ?? null,
    details: entry.details ?? null,
    ipAddress: entry.ipAddress ?? null,
    prevHash,
    rowHash,
  });
}

type ActivityLogRow = {
  id: number;
  timestamp: Date | string;
  user_id: number | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  entity_ref_code: string | null;
  details: unknown;
  ip_address: string | null;
  prev_hash: string | null;
  row_hash: string;
};

/**
 * Integration test helper — walks activity_log in id order and verifies:
 *   1. row.prev_hash === previous row's row_hash (chain continuity).
 *   2. row.row_hash recomputes from (prev_hash, canonical(data), timestamp).
 * Returns the first corrupt row id, or null if the chain is intact.
 */
export async function verifyActivityLogChain(tx: DbTx): Promise<number | null> {
  const res = await tx.execute(sql`
    SELECT id, timestamp, user_id, username, action, entity_type,
           entity_id, entity_ref_code, details, ip_address, prev_hash, row_hash
    FROM activity_log ORDER BY id ASC
  `);
  const rows = (res as unknown as { rows?: ActivityLogRow[] }).rows ?? [];

  let expectedPrev: string | null = null;
  for (const r of rows) {
    if ((r.prev_hash ?? null) !== expectedPrev) return r.id;
    const ts =
      r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString();
    const canonical =
      canonicalJSON({
        action: r.action,
        details: r.details ?? null,
        entityId: r.entity_id ?? null,
        entityRefCode: r.entity_ref_code ?? null,
        entityType: r.entity_type,
        ipAddress: r.ip_address ?? null,
        userId: r.user_id ?? null,
        username: r.username,
      }) +
      "|" +
      ts;
    const expectedRowHash = crypto
      .createHash("sha256")
      .update((r.prev_hash ?? "") + "|" + canonical, "utf8")
      .digest("hex");
    if (expectedRowHash !== r.row_hash) return r.id;
    expectedPrev = r.row_hash;
  }
  return null;
}

// Back-compat export of the old constant name; new code should reference
// HASH_CHAIN_KEYS.activity_log via src/lib/hash-chain.ts.
export const ACTIVITY_LOG_CHAIN_KEY = HASH_CHAIN_KEYS.activity_log;
