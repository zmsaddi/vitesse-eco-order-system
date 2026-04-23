// Phase 5.3 — client-side CSV builder + download.
//
// Format per 22_Print_Export.md §CSV Export (D-22 M13):
//   - Field separator: `;` (semicolon — Excel FR compatibility without locale).
//   - Decimal separator: `.` (dot).
//   - Dates: ISO `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss+02:00` (pass-through).
//   - Encoding: UTF-8 with BOM (`﻿`) so Excel opens it as UTF-8.
//   - Filename: `{entity}-{YYYYMMDD-HHmm}.csv`.
//
// No server endpoint — the browser constructs the file from data already
// loaded into the page (the chart + table rows), matching the contract that
// report data is fetched once via `/api/v1/reports/[slug]` and the CSV is
// a pure render of that payload.

const BOM = "﻿";
const SEP = ";";
const NL = "\r\n";

function escapeCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw);
  // RFC-4180 escaping: if the cell contains separator, quote, or newline,
  // wrap in quotes and double up any embedded quotes.
  if (s.includes(SEP) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string with BOM + semicolon separators + CRLF lines. */
export function buildCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(SEP));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(SEP));
  }
  return BOM + lines.join(NL) + NL;
}

/** Render `{entity}-YYYYMMDD-HHmm.csv` filename in Paris local time. */
export function csvFilename(entity: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const stamp = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
  return `${entity}-${stamp}.csv`;
}

/** Browser download trigger. No-op on server. */
export function downloadCsv(
  entity: string,
  headers: string[],
  rows: Array<Array<unknown>>,
): void {
  if (typeof window === "undefined") return;
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFilename(entity);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
