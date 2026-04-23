import { and, eq, or } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { users } from "@/db/schema";
import {
  currentMonthParisRange,
  parisDayAfter,
  parisDayStart,
  parisNextDayIso,
} from "@/lib/paris-date";
import {
  sumBonuses,
  sumCogs,
  sumExpenses,
  sumGiftCost,
  sumOutstandingDebts,
  sumRevenue,
  sumRewards,
  type TeamFilter,
} from "./kpi-helpers";
import { loadCounts } from "./counts";
import { loadTreasuryBalances } from "./treasury-view";
import {
  assertCanViewDashboard,
  type DashboardClaims,
} from "./permissions";
import type { DashboardQuery, DashboardResponse } from "./dto";

// Phase 5.3 — dashboard main entry. Dispatches to helpers; stays thin.

async function teamFilterFor(
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

function round2(x: number): string {
  return (Math.round((x + Number.EPSILON) * 100) / 100).toFixed(2);
}

export async function getDashboard(
  db: DbHandle,
  query: DashboardQuery,
  claims: DashboardClaims,
): Promise<DashboardResponse> {
  assertCanViewDashboard(claims);

  const defaults = currentMonthParisRange();
  const from = query.dateFrom ?? defaults.from;
  const to = query.dateTo ?? defaults.to;
  const fromDate = parisDayStart(from);
  const toDate = parisDayAfter(to);
  const toExclusiveIso = parisNextDayIso(to);

  const isManager = claims.role === "manager";
  const teamFilter: TeamFilter | null = isManager
    ? await teamFilterFor(db, claims.userId)
    : null;

  const revenue = await sumRevenue(db, from, toExclusiveIso, teamFilter);
  const outstandingDebts = await sumOutstandingDebts(db, teamFilter);
  const treasuryBalances = await loadTreasuryBalances(db, claims);
  const counts = await loadCounts(db, from, toExclusiveIso, teamFilter);

  let netProfit: string | null = null;
  let cashProfit: string | null = null;
  if (!isManager) {
    const cogs = await sumCogs(db, fromDate, toDate);
    const giftCost = await sumGiftCost(db, fromDate, toDate);
    const exp = await sumExpenses(db, from, toExclusiveIso);
    const bns = await sumBonuses(db, from, toExclusiveIso);
    const rwd = await sumRewards(db, from, toExclusiveIso);
    netProfit = round2(
      Number(revenue) -
        Number(cogs) -
        Number(exp) -
        Number(bns) -
        Number(giftCost) -
        Number(rwd),
    );
    cashProfit = round2(
      Number(revenue) -
        Number(exp) -
        Number(bns) -
        Number(giftCost) -
        Number(rwd),
    );
  }

  return {
    period: { from, to },
    kpis: {
      revenue: round2(Number(revenue)),
      netProfit,
      outstandingDebts: round2(Number(outstandingDebts)),
      cashProfit,
    },
    treasuryBalances,
    counts,
  };
}
