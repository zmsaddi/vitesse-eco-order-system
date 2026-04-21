import { PermissionError } from "@/lib/api-errors";
import type { Role } from "@/lib/session-claims";

// Phase 4.4 — settlements + bonuses role gates.
//
// 15_Roles_Permissions.md §settlements + §bonuses (as reconciled this tranche):
//   POST/GET /api/v1/settlements : pm/gm only — no manager, no seller, no driver.
//   GET /api/v1/bonuses          : pm/gm (full audit), seller (own only forced),
//                                  driver (own only forced), manager => 403,
//                                  stock_keeper => 403.
//   Page /settlements            : pm/gm only.
//   Page /my-bonus               : seller/driver only.
//
// Manager is deliberately out-of-scope for GET /api/v1/bonuses in Phase 4.4 to
// avoid team-leak on seller bonuses (per user decision 2026-04-21). Can be
// revisited in a later tranche with a narrowly-scoped team filter.

export type SettlementClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function assertCanCreateSettlement(claims: SettlementClaims): void {
  if (claims.role !== "pm" && claims.role !== "gm") {
    throw new PermissionError("إنشاء التسوية متاح لـ PM/GM فقط.");
  }
}

export function assertCanListSettlements(claims: SettlementClaims): void {
  if (claims.role !== "pm" && claims.role !== "gm") {
    throw new PermissionError("قائمة التسويات متاحة لـ PM/GM فقط.");
  }
}

// GET /api/v1/bonuses: pm/gm unrestricted; seller/driver allowed (own-only
// forced downstream by the service). manager + stock_keeper => 403.
export function assertCanListBonuses(claims: SettlementClaims): void {
  if (
    claims.role !== "pm" &&
    claims.role !== "gm" &&
    claims.role !== "seller" &&
    claims.role !== "driver"
  ) {
    throw new PermissionError("قائمة العلاوات غير متاحة لدورك.");
  }
}

/**
 * Returns the userId the caller is allowed to query. pm/gm may query any
 * userId (or omit for the full audit list); seller/driver always see only
 * their own rows — any query-level userId override is discarded.
 */
export function resolveBonusesQueryOwner(
  claims: SettlementClaims,
  requestedUserId: number | undefined,
): number | undefined {
  if (claims.role === "pm" || claims.role === "gm") return requestedUserId;
  return claims.userId;
}
