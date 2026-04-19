// L3 + BR-51: Europe/Paris timezone for all operations.
// توحيد تنسيقات التواريخ + حواف يوم/شهر timezone-safe.

export const TIMEZONE = "Europe/Paris";

/**
 * Current timestamp (TIMESTAMPTZ-compatible).
 */
export function now(): Date {
  return new Date();
}

/**
 * Current DATE (YYYY-MM-DD) in Europe/Paris.
 */
export function today(): string {
  return toDateString(new Date());
}

/**
 * Convert any Date → YYYY-MM-DD string in Europe/Paris.
 */
export function toDateString(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA → ISO YYYY-MM-DD
}

/**
 * Start of day in Europe/Paris → UTC Date object (for DB range queries).
 *
 * Works via Intl formatToParts to detect Paris wall-clock offset precisely,
 * including DST transitions. Iterative refinement handles edge cases.
 */
export function startOfDayUtc(dateStr: string): Date {
  return parisWallToUtc(`${dateStr}T00:00:00`);
}

/**
 * End of day in Europe/Paris (exclusive — next day midnight) → UTC Date.
 */
export function endOfDayUtc(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDateStr = toUtcDateStr(d);
  return parisWallToUtc(`${nextDateStr}T00:00:00`);
}

/**
 * Convert Paris wall-clock ISO-like string → UTC Date.
 * Uses Intl to compute Paris offset at target instant (DST-safe).
 */
function parisWallToUtc(wallIso: string): Date {
  // Probe: pretend wall == UTC, then ask Intl what Paris shows for that UTC instant.
  let guess = Date.parse(`${wallIso}Z`);
  if (Number.isNaN(guess)) throw new Error(`date: invalid ISO "${wallIso}"`);
  for (let i = 0; i < 3; i++) {
    const offsetMin = parisOffsetMinutes(guess);
    // Correct guess: UTC(wall) = wall_interpreted_as_UTC - offset
    guess = Date.parse(`${wallIso}Z`) - offsetMin * 60_000;
  }
  return new Date(guess);
}

/**
 * Paris offset in minutes (positive when ahead of UTC) at a given instant.
 */
function parisOffsetMinutes(utcMs: number): number {
  const d = new Date(utcMs);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "00";
  const parisAsUtc = Date.parse(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
  );
  return Math.round((parisAsUtc - utcMs) / 60_000);
}

function toUtcDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
