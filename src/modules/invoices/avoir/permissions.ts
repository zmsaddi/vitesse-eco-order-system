import { PermissionError } from "@/lib/api-errors";
import type { Role } from "@/lib/session-claims";

// Phase 4.5 — avoir issuance role gate.
//
// 15_Roles_Permissions.md §avoir: pm + gm only. manager / seller / driver /
// stock_keeper are all 403. Avoir is a legal document that carries the same
// D-35 mentions obligatoires as a regular invoice; granting it to anyone
// below pm/gm would bypass the vendor-legal review step.

export type AvoirClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function assertCanIssueAvoir(claims: AvoirClaims): void {
  if (claims.role !== "pm" && claims.role !== "gm") {
    throw new PermissionError("إصدار Avoir متاح لـ PM/GM فقط.");
  }
}
