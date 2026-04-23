import type { Role } from "@/lib/session-claims";
import { PermissionError } from "@/lib/api-errors";

// Phase 6.2 — Action Hub visibility guard.
//
// Mirrors dashboard/permissions.ts (Phase 5.3): pm / gm / manager allowed;
// operational roles (seller / driver / stock_keeper) receive 403. Scope
// (global vs team-only) is resolved inside service.ts, not here.

export type ActionHubClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function assertCanViewActionHub(claims: ActionHubClaims): void {
  if (claims.role === "pm" || claims.role === "gm" || claims.role === "manager") {
    return;
  }
  throw new PermissionError("مركز العمل غير متاح لدورك.");
}
