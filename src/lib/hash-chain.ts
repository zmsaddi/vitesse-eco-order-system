import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";

// Phase 3.0.1: shared hash-chain protocol (D-80 generalized).
// Any immutable-audit table that maintains (prev_hash, row_hash) uses this helper
// to pick up its link under a chain-wide advisory lock. Each chain gets a unique
// int key so activity_log and cancellations never contend with each other.
//
// Direct INSERT with manually-computed hashes is forbidden — it reintroduces the
// empty-table race that `FOR UPDATE` on "last row" cannot protect against.

export const HASH_CHAIN_KEYS = {
  activity_log: 1_000_001,
  cancellations: 1_000_002,
} as const;

// Tables permitted to participate in a hash chain. Hard-coded to prevent
// accidental SQL-injection via arbitrary table names (sql.raw usage below).
const ALLOWED_TABLES = new Set(Object.keys(HASH_CHAIN_KEYS));

/**
 * Canonical JSON: recursively sort object keys at every depth.
 * Same output for any JS runtime / insertion order → deterministic hash.
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

/**
 * Compute the next hash-chain link for a table.
 *
 * Steps (atomic within the caller's tx):
 *   1. Take a chain-wide transaction advisory lock (covers empty-table race).
 *   2. SELECT last row_hash from the table (NULL if empty).
 *   3. row_hash = sha256(prev_hash || '|' || canonical).
 *
 * Returns { prevHash, rowHash } — caller is responsible for the INSERT.
 *
 * @param config.tableName MUST be a literal from HASH_CHAIN_KEYS keys; not user input.
 */
export async function computeHashChainLink(
  tx: DbTx,
  config: { chainLockKey: number; tableName: string },
  canonical: string,
): Promise<{ prevHash: string | null; rowHash: string }> {
  if (!ALLOWED_TABLES.has(config.tableName)) {
    throw new Error(
      `computeHashChainLink: table "${config.tableName}" not in HASH_CHAIN_KEYS`,
    );
  }

  await tx.execute(sql`SELECT pg_advisory_xact_lock(${config.chainLockKey})`);

  const res = await tx.execute(
    sql.raw(`SELECT row_hash FROM ${config.tableName} ORDER BY id DESC LIMIT 1`),
  );
  const rows = (res as unknown as { rows?: Array<{ row_hash?: string }> }).rows ?? [];
  const prevHash: string | null = rows.length > 0 ? rows[0].row_hash ?? null : null;

  const rowHash = crypto
    .createHash("sha256")
    .update((prevHash ?? "") + "|" + canonical, "utf8")
    .digest("hex");

  return { prevHash, rowHash };
}
