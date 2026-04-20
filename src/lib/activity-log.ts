import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { activityLog } from "@/db/schema";

// D-80: activity_log hash-chain write protocol.
// - pg_advisory_xact_lock(ACTIVITY_LOG_CHAIN_KEY) at the start protects the whole
//   chain (including the empty-table race that a FOR UPDATE on last row cannot).
// - Every write goes through logActivity(tx, …). Direct INSERT on activity_log is
//   forbidden by convention + code review.
// - Canonical JSON = recursively sorted keys + no whitespace; identical input →
//   identical hash regardless of JS object insertion order.

export const ACTIVITY_LOG_CHAIN_KEY = 1_000_001;

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

/**
 * Canonical JSON: object keys sorted lexicographically at every depth.
 * Used so the hash is identical across JS engines/call sites.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") +
    "}"
  );
}

function computeRowHash(args: {
  prevHash: string | null;
  canonical: string;
  timestampIso: string;
}): string {
  const payload = (args.prevHash ?? "") + "|" + args.canonical + "|" + args.timestampIso;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Write one activity_log row with a valid hash-chain link.
 * MUST be called inside an open transaction — the caller provides `tx`.
 */
export async function logActivity(tx: DbTx, entry: ActivityLogEntry): Promise<void> {
  // 1. Chain-wide advisory lock (empty-table race + strict ordering).
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${ACTIVITY_LOG_CHAIN_KEY})`);

  // 2. Fetch last row_hash (NULL for the very first row).
  const res = await tx.execute(
    sql`SELECT row_hash FROM activity_log ORDER BY id DESC LIMIT 1`,
  );
  const rows = (res as unknown as { rows?: Array<{ row_hash?: string }> }).rows ?? [];
  const prevHash: string | null = rows.length > 0 ? rows[0].row_hash ?? null : null;

  // 3. Compute new row_hash off a canonical, deterministic payload + timestamp.
  const now = new Date();
  const timestampIso = now.toISOString();
  const canonical = canonicalJSON({
    action: entry.action,
    details: entry.details ?? null,
    entityId: entry.entityId ?? null,
    entityRefCode: entry.entityRefCode ?? null,
    entityType: entry.entityType,
    ipAddress: entry.ipAddress ?? null,
    userId: entry.userId ?? null,
    username: entry.username,
  });
  const rowHash = computeRowHash({ prevHash, canonical, timestampIso });

  // 4. INSERT — timestamp must match the value we hashed against.
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
 * Integration test helper — walks every activity_log row in id order and checks:
 *   1. row.prev_hash === prev_row.row_hash (chain continuity)
 *   2. row.row_hash === sha256(prev_hash || canonical(data) || timestamp)
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
    const canonical = canonicalJSON({
      action: r.action,
      details: r.details ?? null,
      entityId: r.entity_id ?? null,
      entityRefCode: r.entity_ref_code ?? null,
      entityType: r.entity_type,
      ipAddress: r.ip_address ?? null,
      userId: r.user_id ?? null,
      username: r.username,
    });
    const expected = computeRowHash({ prevHash: r.prev_hash ?? null, canonical, timestampIso: ts });
    if (expected !== r.row_hash) return r.id;

    expectedPrev = r.row_hash;
  }
  return null;
}
