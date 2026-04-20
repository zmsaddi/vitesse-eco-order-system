import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { formatParisDate, hashTextToInt } from "@/modules/orders/ref-code";

// BR-67: DL-YYYYMMDD-NNNNN — mirrors orders/purchases counter pattern.
// Advisory-locked per (prefix, day); Europe/Paris date per L3.
export async function generateDeliveryRefCode(tx: DbTx): Promise<string> {
  const prefix = "DL";
  const today = formatParisDate(new Date());
  const lockKey = hashTextToInt(prefix + "|" + today);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  const res = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(ref_code, '-', 3) AS INTEGER)), 0) + 1 AS next
    FROM deliveries
    WHERE ref_code LIKE ${prefix + "-" + today + "-%"}
  `);
  const rows = (res as unknown as { rows?: Array<{ next: number }> }).rows ?? [];
  const next = rows.length > 0 ? Number(rows[0].next) : 1;
  return `${prefix}-${today}-${String(next).padStart(5, "0")}`;
}
