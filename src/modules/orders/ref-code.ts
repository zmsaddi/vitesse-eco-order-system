import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";

// BR-67: ORD-YYYYMMDD-NNNNN — atomic counter per day, advisory-locked so
// concurrent creates on the same day never read the same MAX. Europe/Paris
// per decision L3.

export async function generateOrderRefCode(tx: DbTx): Promise<string> {
  const prefix = "ORD";
  const today = formatParisDate(new Date());
  const lockKey = hashTextToInt(prefix + "|" + today);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  const res = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(ref_code, '-', 3) AS INTEGER)), 0) + 1 AS next
    FROM orders
    WHERE ref_code LIKE ${prefix + "-" + today + "-%"}
  `);
  const rows = (res as unknown as { rows?: Array<{ next: number }> }).rows ?? [];
  const next = rows.length > 0 ? Number(rows[0].next) : 1;
  return `${prefix}-${today}-${String(next).padStart(5, "0")}`;
}

/** Europe/Paris "YYYYMMDD" — DST-correct via Intl. */
export function formatParisDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}${parts.month}${parts.day}`;
}

/** Deterministic int32 hash of a string, safe for pg_advisory_xact_lock. */
export function hashTextToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
