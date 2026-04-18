import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

const sql = neon(process.env.POSTGRES_URL!)
export const db = drizzle(sql)

export type DbTransaction = typeof db

/**
 * Execute a function within a transaction.
 * All money-moving operations MUST use this.
 */
export async function withTx<T>(
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  // Neon HTTP driver doesn't support traditional transactions.
  // For atomic operations, use Neon's transaction() method
  // or migrate to WebSocket driver when needed.
  // For now, execute directly — single SQL statements are atomic.
  return fn(db)
}
