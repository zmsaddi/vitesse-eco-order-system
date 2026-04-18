/**
 * Shared utility functions.
 * Timezone: Europe/Paris (decision L3).
 */

/** Format number with 2 decimal places */
export function formatNumber(n: number): string {
  return n.toFixed(2)
}

/** Format currency (EUR) */
export function formatCurrency(n: number): string {
  return `${formatNumber(n)} €`
}

/** Get today's date in Europe/Paris timezone as YYYY-MM-DD */
export function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/Paris',
  })
}

/** Get current timestamp in Europe/Paris */
export function getNowParis(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  )
}

/** Format date for display (Arabic locale) */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

/** Parse NUMERIC string from Drizzle to number */
export function parseNumeric(value: string | number | null): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  return parseFloat(value) || 0
}
