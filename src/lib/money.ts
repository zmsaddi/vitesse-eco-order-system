/**
 * Financial precision utilities.
 * All amounts are TTC (decision H1).
 * Precision: 0.01€ (NUMERIC 19,2).
 */

/** Round to 2 decimal places with epsilon correction */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Extract TVA from TTC amount (for invoice display only — H1/M2) */
export function tvaFromTtc(ttc: number, vatRate: number = 20): number {
  return round2(ttc * vatRate / (100 + vatRate))
}

/** Get HT from TTC amount (for invoice display only) */
export function htFromTtc(ttc: number, vatRate: number = 20): number {
  return round2(ttc - tvaFromTtc(ttc, vatRate))
}

/** Convert to cents (integer) for safe arithmetic */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Convert from cents back to euros */
export function fromCents(cents: number): number {
  return cents / 100
}

/** Check if two amounts are equal within tolerance (0.01€) */
export function amountsEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance
}
