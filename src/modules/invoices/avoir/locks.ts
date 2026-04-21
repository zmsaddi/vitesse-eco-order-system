import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { invoiceLines, invoices } from "@/db/schema";

// Phase 4.5 — FOR UPDATE helpers + the aggregate that drives the
// running-total refund guard. Extracted from `issue.ts` to keep the
// main orchestration file under the 300-line cap.

export type LockedInvoiceRow = typeof invoices.$inferSelect;
export type LockedLineRow = typeof invoiceLines.$inferSelect;

export async function lockInvoiceForUpdate(
  tx: DbTx,
  id: number,
): Promise<LockedInvoiceRow | null> {
  const rows = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)))
    .for("update")
    .limit(1);
  return rows[0] ?? null;
}

export async function lockLinesForUpdate(
  tx: DbTx,
  invoiceId: number,
): Promise<LockedLineRow[]> {
  return tx
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
    .orderBy(asc(invoiceLines.lineNumber))
    .for("update");
}

export async function lockExistingAvoirsForParent(
  tx: DbTx,
  parentId: number,
): Promise<Array<{ id: number }>> {
  return tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(eq(invoices.avoirOfId, parentId), isNull(invoices.deletedAt)),
    )
    .for("update");
}

/**
 * For every parent line (keyed by its line_number), sum the absolute
 * quantity already credited across all non-deleted avoirs of that parent.
 * Avoir lines preserve the parent line_number on construction (see
 * issue.ts), so the 1-to-1 key is reliable.
 *
 * Returns an empty map when no prior avoirs exist.
 */
export async function sumExistingAvoirLinesPerParentLine(
  tx: DbTx,
  parentId: number,
): Promise<Map<number, number>> {
  const res = await tx.execute(sql`
    SELECT il.line_number AS line_number,
           COALESCE(SUM(ABS(il.quantity::numeric)), 0)::numeric AS total_credited
    FROM invoices a
    JOIN invoice_lines il ON il.invoice_id = a.id
    WHERE a.avoir_of_id = ${parentId}
      AND a.deleted_at IS NULL
    GROUP BY il.line_number
  `);
  const rows =
    (res as unknown as {
      rows?: Array<{ line_number: number; total_credited: string }>;
    }).rows ?? [];
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(Number(r.line_number), Number(r.total_credited));
  }
  return map;
}
