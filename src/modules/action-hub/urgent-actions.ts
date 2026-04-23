import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import {
  orders,
  payments,
  settings,
  treasuryAccounts,
  userBonusRates,
  users,
} from "@/db/schema";
import { D35_REQUIRED_SETTINGS } from "@/modules/invoices/d35-gate";
import type { TeamFilter } from "@/modules/dashboard/kpi-helpers";
import { todayParisIso } from "@/lib/paris-date";

// Phase 6.2 — urgent-action count helpers for /action-hub.
//
// Four NEW counts live here. Two overlapping counts (pendingCancellations,
// lowStock) are intentional aliases of the Phase 5.3 team-counts output —
// they are NOT duplicated in this file; service.ts reads them straight from
// loadCounts() to keep a single source of truth.
//
// Manager scope is applied via an optional TeamFilter (same shape used by
// dashboard/service.ts). pm/gm pass `null` → global scope.

const OVERDUE_DAYS = 7;
const SNAPSHOT_STALE_DAYS = 60;

// Pure helper — exported for unit testing. Accepts any YYYY-MM-DD date and
// returns the same format shifted by N days back. Uses UTC parsing for
// determinism; the caller compares against a Paris-local date column so
// the 1–2h TZ skew near midnight is acceptable for a 7-day cutoff.
export function isoDaysAgo(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Pure helper — exported for unit testing. Mirrors the placeholder detection
// that /api/init + invoices/d35-gate reject: blank, whitespace-only, or the
// well-known tokens TO_FILL / XXX / TODO.
export function isIncompleteSettingValue(value: string | null | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (value.trim() === "") return true;
  return /TO_FILL/i.test(value) || /^XXX$/i.test(value) || /TODO/i.test(value);
}

/**
 * Overdue payments — orders older than OVERDUE_DAYS that still carry an
 * outstanding balance (total_amount − advance_paid − SUM(payments.amount) > 0),
 * excluding cancelled and soft-deleted orders.
 */
export async function countOverduePayments(
  db: DbHandle,
  teamFilter: TeamFilter | null,
): Promise<number> {
  const cutoff = isoDaysAgo(todayParisIso(), OVERDUE_DAYS);
  const filters: Parameters<typeof and> = [
    isNull(orders.deletedAt),
    sql`${orders.status} <> 'ملغي'`,
    sql`${orders.date} <= ${cutoff}`,
    sql`(${orders.totalAmount} - ${orders.advancePaid} - COALESCE((
      SELECT SUM(${payments.amount})
      FROM ${payments}
      WHERE ${payments.orderId} = ${orders.id}
        AND ${payments.deletedAt} IS NULL
    ), 0)) > 0`,
  ];
  if (teamFilter) {
    filters.push(
      inArray(
        orders.createdBy,
        teamFilter.usernames.length > 0 ? teamFilter.usernames : [""],
      ),
    );
  }
  const rows = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(orders)
    .where(and(...filters));
  return Number(rows[0]?.n ?? 0);
}

/**
 * Reconciliation due — manager_box or driver_custody accounts with positive
 * balance in the viewer's scope. Proxy per Q3 of the Phase 6.2 contract:
 * the schema has no per-user reconciliation calendar, so positive-balance
 * team boxes stand in for the "handover / settlement required" queue.
 */
export async function countReconciliationDue(
  db: DbHandle,
  teamFilter: TeamFilter | null,
): Promise<number> {
  const filters: Parameters<typeof and> = [
    eq(treasuryAccounts.active, 1),
    inArray(treasuryAccounts.type, ["manager_box", "driver_custody"]),
    sql`CAST(${treasuryAccounts.balance} AS NUMERIC) > 0`,
  ];
  if (teamFilter) {
    filters.push(
      inArray(
        treasuryAccounts.ownerUserId,
        teamFilter.userIds.length > 0 ? teamFilter.userIds : [-1],
      ),
    );
  }
  const rows = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(treasuryAccounts)
    .where(and(...filters));
  return Number(rows[0]?.n ?? 0);
}

/**
 * Stale commission snapshots — user_bonus_rates rows whose updated_at is
 * older than SNAPSHOT_STALE_DAYS, including never-updated rows (NULL).
 * Manager scope: rows belonging to self + direct-report drivers.
 */
export async function countStaleBonusSnapshots(
  db: DbHandle,
  teamFilter: TeamFilter | null,
): Promise<number> {
  const staleCutoff = sql`NOW() - INTERVAL '${sql.raw(String(SNAPSHOT_STALE_DAYS))} days'`;
  const filters: Parameters<typeof and> = [
    or(isNull(userBonusRates.updatedAt), lt(userBonusRates.updatedAt, staleCutoff)),
  ];
  if (teamFilter) {
    filters.push(
      inArray(
        userBonusRates.username,
        teamFilter.usernames.length > 0 ? teamFilter.usernames : [""],
      ),
    );
  }
  const rows = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(userBonusRates)
    .where(and(...filters));
  return Number(rows[0]?.n ?? 0);
}

/**
 * Incomplete settings — D-35 required settings with empty or placeholder
 * value. Global; settings are system-wide so no team filter applies.
 */
export async function countIncompleteSettings(db: DbHandle): Promise<number> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, D35_REQUIRED_SETTINGS as unknown as string[]));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  let missing = 0;
  for (const k of D35_REQUIRED_SETTINGS) {
    if (isIncompleteSettingValue(byKey.get(k))) missing++;
  }
  return missing;
}

/** Team-scope resolver — self + direct-report drivers. Mirrors dashboard/service.teamFilterFor. */
export async function teamFilterForManager(
  db: DbHandle,
  managerUserId: number,
): Promise<TeamFilter> {
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      or(
        eq(users.id, managerUserId),
        and(eq(users.managerId, managerUserId), eq(users.role, "driver")),
      ),
    );
  return {
    userIds: rows.map((r) => r.id),
    usernames: rows.map((r) => r.username),
  };
}
