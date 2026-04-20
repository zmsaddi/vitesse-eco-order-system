import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";

// Phase 4.1 — BR-64/BR-67 invoice ref-code generator.
//
// Format: FAC-YYYY-MM-NNNN (4-digit zero-padded monthly counter).
// Reset: monthly (Europe/Paris). Year+month are derived from NOW() rendered
// in Paris time.
//
// Atomicity: INSERT ... ON CONFLICT (year, month) DO UPDATE SET last_number =
// last_number + 1 RETURNING last_number. Postgres serializes the update-in-
// conflict path, so concurrent tx's see strictly monotonic numbers without
// application-level locking.

function parisYearMonth(d: Date): { year: number; month: number } {
  // en-CA gives YYYY-MM-DD — split keeps us locale-stable.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m] = iso.split("-");
  return { year: Number(y), month: Number(m) };
}

export async function generateInvoiceRefCode(tx: DbTx): Promise<string> {
  const { year, month } = parisYearMonth(new Date());

  const res = await tx.execute(
    sql`INSERT INTO invoice_sequence (year, month, last_number)
        VALUES (${year}, ${month}, 1)
        ON CONFLICT (year, month)
        DO UPDATE SET last_number = invoice_sequence.last_number + 1
        RETURNING last_number`,
  );
  const rows = (res as unknown as { rows?: Array<{ last_number: number }> }).rows ?? [];
  if (rows.length === 0) {
    throw new Error("generateInvoiceRefCode: invoice_sequence RETURNING empty");
  }
  const n = rows[0].last_number;

  const mm = String(month).padStart(2, "0");
  const nn = String(n).padStart(4, "0");
  return `FAC-${year}-${mm}-${nn}`;
}
