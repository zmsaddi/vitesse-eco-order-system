import { z } from "zod";

// Phase 6.2 — Action Hub DTOs.
//
// Response shape for GET /api/v1/action-hub. Composes three concrete sections
// per 25_Dashboard_Requirements.md §"Action Hub لـ admin roles (D-72)":
//   1) urgentActions  — six named counts, each an int ≥ 0 + optional drill link
//   2) recentActivity — exactly up to 5 rows from Phase 5.2 activity-log
//   3) teamCounts     — four ints reused from Phase 5.3 dashboard counts

const NonNegInt = z.number().int().nonnegative();

export const UrgentActionsDto = z.object({
  overduePayments: NonNegInt,
  reconciliationDue: NonNegInt,
  pendingCancellations: NonNegInt,
  staleSnapshots: NonNegInt,
  lowStock: NonNegInt,
  incompleteSettings: NonNegInt,
  total: NonNegInt,
});
export type UrgentActionsDto = z.infer<typeof UrgentActionsDto>;

export const RecentActivityRowDto = z.object({
  id: z.number().int().positive(),
  timestamp: z.string(), // ISO with TZ
  username: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.number().int().positive().nullable(),
  entityRefCode: z.string().nullable(),
});
export type RecentActivityRowDto = z.infer<typeof RecentActivityRowDto>;

export const TeamCountsDto = z.object({
  ordersToday: NonNegInt,
  deliveriesPending: NonNegInt,
  lowStockCount: NonNegInt,
  openCancellations: NonNegInt,
});
export type TeamCountsDto = z.infer<typeof TeamCountsDto>;

export const ActionHubResponse = z.object({
  scope: z.enum(["global", "team"]),
  urgentActions: UrgentActionsDto,
  recentActivity: z.array(RecentActivityRowDto).max(5),
  teamCounts: TeamCountsDto,
});
export type ActionHubResponse = z.infer<typeof ActionHubResponse>;
