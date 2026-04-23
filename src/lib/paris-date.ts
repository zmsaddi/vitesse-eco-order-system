// Phase 5.3 — Europe/Paris date helpers for dashboard + reports range filters.
//
// Standalone by design: the Phase 5.2 `activity/service.ts` carries its own
// private helpers with the same semantic intent; consolidation is deliberately
// deferred to a later refactor tranche. This file is used by 5.3 only.
//
// Semantics:
//   - Input is a plain YYYY-MM-DD ISO date string.
//   - Paris TZ is DST-aware: the returned `Date` represents the exact UTC
//     instant that corresponds to 00:00 Europe/Paris on that calendar day,
//     accounting for CET/CEST.
//   - `parisDayAfter(dateIso)` returns 00:00 on the next Paris day —
//     the exclusive upper bound for an "inclusive-to-that-day" filter.

function parisOffsetForDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  // Probe at 12:00 UTC to avoid any DST-transition-at-midnight ambiguity.
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "shortOffset",
  }).formatToParts(probe);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  // tz looks like "GMT+1" (CET) or "GMT+2" (CEST) — shortOffset strips zero-padding.
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tz);
  if (!match) return "+01:00";
  const hh = match[2].padStart(2, "0");
  const mm = match[3] ?? "00";
  return `${match[1]}${hh}:${mm}`;
}

/** Returns the UTC instant corresponding to 00:00 Europe/Paris on `dateIso`. */
export function parisDayStart(dateIso: string): Date {
  const offset = parisOffsetForDate(dateIso);
  return new Date(`${dateIso}T00:00:00${offset}`);
}

/** Calendar day after `dateIso` as a plain ISO string (YYYY-MM-DD).
 * Use this as the exclusive upper bound when the DB column is a DATE
 * (text) — avoids the UTC-round-trip bug where the Paris-midnight Date's
 * UTC day can be one earlier than the Paris local day. */
export function parisNextDayIso(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const nextUtc = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = nextUtc.getUTCFullYear();
  const mm = String(nextUtc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nextUtc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Returns the UTC instant corresponding to 00:00 Europe/Paris on the day
 * after `dateIso`. Useful as an exclusive upper bound when the DB column
 * is a TIMESTAMPTZ (e.g. confirmation_date). */
export function parisDayAfter(dateIso: string): Date {
  return parisDayStart(parisNextDayIso(dateIso));
}

/** Current Paris "YYYY-MM-DD" — DST-correct. */
export function todayParisIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Default dashboard range: current calendar month's first day → today (Paris). */
export function currentMonthParisRange(
  now: Date = new Date(),
): { from: string; to: string } {
  const today = todayParisIso(now);
  const [year, month] = today.split("-");
  return { from: `${year}-${month}-01`, to: today };
}
