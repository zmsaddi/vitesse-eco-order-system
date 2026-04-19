import { NAV_BY_ROLE, type NavItem } from "@/components/layout/nav-items";
import type { Role } from "@/lib/session-claims";

// Single source of truth for "what nav items does this role see".
// Used by both src/app/(app)/layout.tsx (SSR) and src/app/api/v1/me/route.ts (API).
//
// Today's implementation returns the role-specific list from NAV_BY_ROLE — that
// list embeds role-specific labels ("طلبات فريقي" for manager vs "طلباتي" for
// seller) that a pure can(role, resource, "view") filter can't express.
//
// When per-role contextual labels disappear (Phase 3+), swap this to a
// filter over a flat NAV_CATALOG + can() checks — interface unchanged.

export function getNavForRole(role: Role): NavItem[] {
  return NAV_BY_ROLE[role];
}

export type { NavItem };
