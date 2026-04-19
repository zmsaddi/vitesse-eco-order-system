import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NeonQueryResultHKT } from "drizzle-orm/neon-serverless";
import type { PgTransaction } from "drizzle-orm/pg-core";
import ws from "ws";
import { env } from "@/lib/env";

// D-05 + D-26: WebSocket Pool per-invocation + ctx.waitUntil(pool.end()).
// Neon HTTP driver لا يدعم transactions → نستخدم WebSocket Pool للكتابات.
// Pool lifecycle صارم: max=1 + idleTimeout=1s + ctx.waitUntil(end) لتجنب connection leaks.

// WebSocket constructor injection (Node.js — Edge/browser supplies native WebSocket).
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

/**
 * Create a fresh Pool for a single invocation/transaction.
 * MUST be closed via `pool.end()` — typically via `ctx.waitUntil(pool.end())` in route handlers.
 */
export function createPool(): Pool {
  return new Pool({
    connectionString: env().DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
  });
}

/**
 * Optional request context for ctx.waitUntil (passed from Next.js route handler).
 */
export type WithTxContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

/**
 * Execute a transaction with proper Pool lifecycle (D-26).
 *
 * Usage in route handlers:
 *   export async function POST(request: Request, ctx: WithTxContext) {
 *     return withTxInRoute(ctx, async (tx) => {
 *       // ... drizzle operations
 *     });
 *   }
 */
/**
 * Transaction handle type exported so module service files can declare fn signatures.
 * This matches exactly what Drizzle's `db.transaction((tx) => ...)` passes as `tx`.
 */
export type DbTx = PgTransaction<
  NeonQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;

export async function withTxInRoute<T>(
  ctx: WithTxContext | undefined,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const pool = createPool();
  const db = drizzle(pool);
  try {
    return await db.transaction(fn);
  } finally {
    if (ctx?.waitUntil) {
      ctx.waitUntil(pool.end());
    } else {
      await pool.end();
    }
  }
}

/**
 * One-shot read (no transaction). Still uses WebSocket Pool for schema consistency.
 * Prefer this for simple GETs to avoid BEGIN/COMMIT overhead.
 */
/** Full (non-transactional) Drizzle handle type. */
export type DbHandle = NeonDatabase<Record<string, unknown>>;

export async function withRead<T>(
  ctx: WithTxContext | undefined,
  fn: (db: DbHandle) => Promise<T>,
): Promise<T> {
  const pool = createPool();
  const db = drizzle(pool);
  try {
    return await fn(db);
  } finally {
    if (ctx?.waitUntil) {
      ctx.waitUntil(pool.end());
    } else {
      await pool.end();
    }
  }
}
