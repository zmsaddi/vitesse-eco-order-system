import type { Role } from "@/lib/session-claims";
import { PermissionError } from "@/lib/api-errors";

// Phase 5.3 — Dashboard visibility guard.
//
// Per the amended 25_Dashboard_Requirements.md (Phase 5.3):
//   pm, gm, manager → allowed (scope differs in service.ts).
//   seller, driver, stock_keeper → 403. No separate dashboard in MVP.
// The old "dashboard:view for all six roles" note is a drift — operational
// roles land on their task page directly. 25_Dashboard_Requirements.md is
// corrected in this tranche's docs sync.

export type DashboardClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function assertCanViewDashboard(claims: DashboardClaims): void {
  if (claims.role === "pm" || claims.role === "gm" || claims.role === "manager") {
    return;
  }
  throw new PermissionError("لوحة التحكم غير متاحة لدورك في هذه المرحلة.");
}
