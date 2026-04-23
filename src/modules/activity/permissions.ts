import type { Role } from "@/lib/session-claims";
import { PermissionError } from "@/lib/api-errors";

// Phase 5.2 — activity visibility guard.
//
// Role matrix per 15_Roles_Permissions.md:
//   pm, gm     → full visibility.
//   manager    → self + linked drivers only (team-scope). Enforcement is in
//                service.ts via users.manager_id lookup; this file only gates
//                "can this role even ask?".
//   seller, driver, stock_keeper → 403 at the route layer.

export type ActivityClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function assertCanViewActivity(claims: ActivityClaims): void {
  if (claims.role === "pm" || claims.role === "gm" || claims.role === "manager") {
    return;
  }
  throw new PermissionError("سجل النشاطات غير متاح لدورك.");
}
