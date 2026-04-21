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

// Phase 4.3 — transfer is PM/GM only. No manager, no driver.
export function assertCanTransfer(claims: TreasuryClaims): void {
  if (claims.role !== "pm" && claims.role !== "gm") {
    throw new PermissionError(
      "تحويل الأموال بين الصناديق متاح لـ PM/GM فقط.",
    );
  }
}

// Phase 4.3 — reconcile role gate (coarse; fine-grained "manager owns the
// target account" check lives in reconcile.ts because it needs the account
// row). This gate rejects seller / driver / stock_keeper at the service
// boundary as defense-in-depth against a route layer bypass.
export function assertCanReconcile(claims: TreasuryClaims): void {
  if (
    claims.role !== "pm" &&
    claims.role !== "gm" &&
    claims.role !== "manager"
  ) {
    throw new PermissionError(
      "تسوية الصندوق متاحة لـ PM/GM والمدير فقط.",
    );
  }
}
