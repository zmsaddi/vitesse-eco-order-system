import type { Role } from "@/lib/session-claims";
import { BusinessRuleError, PermissionError } from "@/lib/api-errors";
import { REPORT_REGISTRY, REPORT_SLUGS, type ReportSlug } from "./dto";

// Phase 5.3 — reports permission layer.
//
// Two-step guard:
//   1. The slug must be one of the 6 in REPORT_SLUGS, else 404
//      REPORT_NOT_FOUND (slug doesn't exist — not a role issue).
//   2. The caller's role must be in REPORT_REGISTRY[slug].roles, else 403.
// Integration tests (T-REP-INVALID-SLUG + T-REP-SLUG-FORBIDDEN-FOR-ROLE)
// pin both behaviours.

export type ReportsClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function assertSlugExists(slug: string): asserts slug is ReportSlug {
  if (!(REPORT_SLUGS as readonly string[]).includes(slug)) {
    throw new BusinessRuleError(
      "التقرير غير موجود.",
      "REPORT_NOT_FOUND",
      404,
      "reports.permissions: slug not in REPORT_SLUGS",
      { slug },
    );
  }
}

export function assertRoleCanRunReport(
  claims: ReportsClaims,
  slug: ReportSlug,
): void {
  const allowed = REPORT_REGISTRY[slug].roles;
  if (!(allowed as readonly string[]).includes(claims.role)) {
    throw new PermissionError(
      `التقرير "${slug}" غير متاح لدورك.`,
    );
  }
}

// Registry view filtered to what the caller can see on the /reports index.
export function reportsForRole(role: Role): Array<{
  slug: ReportSlug;
  titleAr: string;
  description: string;
  chart: string;
}> {
  return REPORT_SLUGS.filter((s) =>
    (REPORT_REGISTRY[s].roles as readonly string[]).includes(role),
  ).map((s) => ({
    slug: s,
    titleAr: REPORT_REGISTRY[s].titleAr,
    description: REPORT_REGISTRY[s].description,
    chart: REPORT_REGISTRY[s].chart,
  }));
}
