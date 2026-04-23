import { and, eq, or } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { users } from "@/db/schema";
import { currentMonthParisRange } from "@/lib/paris-date";
import { assertRoleCanRunReport, assertSlugExists } from "./permissions";
import type { ReportsClaims } from "./permissions";
import type { AnyReport, ReportQuery, ReportSlug } from "./dto";
import {
  runExpensesByCategory,
  runPnl,
} from "./runners-financial";
import {
  runBonusesByUser,
  runRevenueByDay,
  runTopClientsByDebt,
  runTopProducts,
  type TeamFilter,
} from "./runners-rankings";

// Phase 5.3 — reports entry point. Dispatches by slug.

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

export async function runReport(
  db: DbHandle,
  slug: string,
  query: ReportQuery,
  claims: ReportsClaims,
): Promise<AnyReport> {
  assertSlugExists(slug);
  const typedSlug = slug as ReportSlug;
  assertRoleCanRunReport(claims, typedSlug);

  const defaults = currentMonthParisRange();
  const from = query.dateFrom ?? defaults.from;
  const to = query.dateTo ?? defaults.to;

  const teamFilter =
    claims.role === "manager" ? await teamFilterFor(db, claims.userId) : null;

  switch (typedSlug) {
    case "pnl":
      return runPnl(db, from, to);
    case "revenue-by-day":
      return runRevenueByDay(db, from, to, teamFilter);
    case "top-clients-by-debt":
      return runTopClientsByDebt(db);
    case "top-products-by-revenue":
      return runTopProducts(db, from, to);
    case "expenses-by-category":
      return runExpensesByCategory(db, from, to);
    case "bonuses-by-user":
      return runBonusesByUser(db, from, to, teamFilter);
  }
}
