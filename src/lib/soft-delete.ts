import { sql, type SQL } from "drizzle-orm";

// D-04 + D-27 + D-76: soft-delete مطلق للجداول المالية/التشغيلية.
// كل جدول حركي يحمل `deleted_at` + FK = RESTRICT (cascade يُحاكى يدوياً في withTx).

/**
 * SQL fragment: row is NOT soft-deleted.
 * Use in WHERE clauses: `.where(and(eq(orders.id, id), notDeleted(orders.deletedAt)))`
 */
export function notDeleted(deletedAtCol: unknown): SQL {
  return sql`${deletedAtCol} IS NULL`;
}

/**
 * SQL fragment: row IS soft-deleted.
 */
export function isDeleted(deletedAtCol: unknown): SQL {
  return sql`${deletedAtCol} IS NOT NULL`;
}
