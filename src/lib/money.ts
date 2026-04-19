// D-02 + BR-50: كل الأرقام المالية NUMERIC(19,2) في DB، TTC، tolerance 0.01€.
// Drizzle يعيد NUMERIC كـ string → نُحوِّل إلى number + نُدوِّر.

const CENT = 100;
const TOLERANCE = 0.005; // half-cent — للتعويض عن FP drift

/**
 * Round to 2 decimal places safely (FP-safe + sign-safe).
 * Positive and negative halves both round away from zero.
 * Math.round((1.005 + EPSILON) * 100) / 100 = 1.01
 * Math.round((-1.005 - EPSILON) * 100) / 100 = -1.01 (sign-preserved via sign-aware bias)
 */
export function round2(x: number): number {
  if (!Number.isFinite(x)) {
    throw new Error(`money.round2: non-finite ${x}`);
  }
  if (x === 0) return 0;
  const sign = x >= 0 ? 1 : -1;
  return (sign * Math.round((Math.abs(x) + Number.EPSILON) * CENT)) / CENT;
}

/**
 * Parse Drizzle NUMERIC(19,2) string → number. Throws if not a finite number.
 */
export function toNumber(dbValue: string | number | null | undefined): number {
  if (dbValue === null || dbValue === undefined) return 0;
  const n = typeof dbValue === "number" ? dbValue : parseFloat(dbValue);
  if (!Number.isFinite(n)) {
    throw new Error(`money.toNumber: invalid numeric value "${dbValue}"`);
  }
  return n;
}

/**
 * Convert number → string representation suitable for NUMERIC(19,2) INSERT/UPDATE.
 */
export function toDb(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`money.toDb: non-finite ${n}`);
  return round2(n).toFixed(2);
}

/**
 * Compare two money amounts within tolerance (0.01€ per BR-50).
 */
export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) < TOLERANCE;
}

/**
 * Sum array of numbers with round2 protection.
 */
export function moneySum(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}
