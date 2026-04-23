import type { DbHandle } from "@/db/client";
import { loadCounts } from "@/modules/dashboard/counts";
import { listActivity } from "@/modules/activity/service";
import {
  countIncompleteSettings,
  countOverduePayments,
  countReconciliationDue,
  countStaleBonusSnapshots,
  teamFilterForManager,
} from "./urgent-actions";
import {
  assertCanViewActionHub,
  type ActionHubClaims,
} from "./permissions";
import type { ActionHubResponse } from "./dto";
import { todayParisIso } from "@/lib/paris-date";

// Phase 6.2 — Action Hub composer.
//
// Keeps three sections' fetches in parallel to minimise end-to-end latency:
//   - urgent-action helpers (4 NEW counts)
//   - team-counts (reused Phase 5.3 loadCounts — also supplies pendingCancellations
//     and lowStock as aliases into the urgent section per spec overlap)
//   - recent activity (Phase 5.2 listActivity with limit=5)
//
// Manager scope: a single TeamFilter is resolved once and passed to every
// helper that supports it. pm/gm pass null → global scope.

export async function loadActionHubPayload(
  db: DbHandle,
  claims: ActionHubClaims,
): Promise<ActionHubResponse> {
  assertCanViewActionHub(claims);

  const isManager = claims.role === "manager";
  const teamFilter = isManager
    ? await teamFilterForManager(db, claims.userId)
    : null;

  const today = todayParisIso();
  const tomorrow = todayPlusOneDay(today);

  // Parallel dispatch — each branch is a self-contained read.
  const [
    overduePayments,
    reconciliationDue,
    staleSnapshots,
    incompleteSettings,
    teamCountsRaw,
    activityResp,
  ] = await Promise.all([
    countOverduePayments(db, teamFilter),
    countReconciliationDue(db, teamFilter),
    countStaleBonusSnapshots(db, teamFilter),
    countIncompleteSettings(db),
    loadCounts(db, today, tomorrow, teamFilter),
    listActivity(
      db,
      { limit: 5, offset: 0 },
      { userId: claims.userId, username: claims.username, role: claims.role },
    ),
  ]);

  // Spec overlap: pendingCancellations + lowStock live in BOTH sections.
  // Taken straight from loadCounts to guarantee the two sections never drift.
  const pendingCancellations = teamCountsRaw.openCancellations;
  const lowStock = teamCountsRaw.lowStockCount;
  const total =
    overduePayments +
    reconciliationDue +
    pendingCancellations +
    staleSnapshots +
    lowStock +
    incompleteSettings;

  return {
    scope: isManager ? "team" : "global",
    urgentActions: {
      overduePayments,
      reconciliationDue,
      pendingCancellations,
      staleSnapshots,
      lowStock,
      incompleteSettings,
      total,
    },
    recentActivity: activityResp.items.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      username: r.username,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      entityRefCode: r.entityRefCode,
    })),
    teamCounts: {
      ordersToday: teamCountsRaw.ordersToday,
      deliveriesPending: teamCountsRaw.deliveriesPending,
      lowStockCount: teamCountsRaw.lowStockCount,
      openCancellations: teamCountsRaw.openCancellations,
    },
  };
}

function todayPlusOneDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
