import { PermissionError } from "@/lib/api-errors";
import type { Role } from "@/lib/session-claims";

// Phase 4.2 — treasury role-based visibility + handover gates.
//
// 15_Roles_Permissions.md §treasury:
//   pm/gm      : view_all (every box + every custody system-wide)
//   manager    : view own manager_box + view driver_custody of drivers whose
//                manager_id = this manager's userId; no cross-team
//   driver     : view own custody only
//   seller     : 403
//   stock_keeper : 403
//
// Handover:
//   driver     : self → own-manager (amount from own custody, dest = manager_box
//                belonging to driver.manager_id)
//   manager    : receiving on behalf of a driver whose manager_id = self.userId
//   others     : 403

export type TreasuryClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function assertCanViewTreasury(claims: TreasuryClaims): void {
  if (
    claims.role !== "pm" &&
    claims.role !== "gm" &&
    claims.role !== "manager" &&
    claims.role !== "driver"
  ) {
    throw new PermissionError(
      "الصندوق غير متاح لدورك.",
    );
  }
}

export function assertCanHandover(claims: TreasuryClaims): void {
  if (claims.role !== "driver" && claims.role !== "manager") {
    throw new PermissionError(
      "تسليم الأموال متاح للسائق والمدير فقط.",
    );
  }
}
