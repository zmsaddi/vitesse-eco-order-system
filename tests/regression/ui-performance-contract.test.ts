import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// UX hotfix pack — Tranche 3 performance contract guard.
//
// Pure filesystem reads + regex assertions. NO browser, NO DB, NO route
// invocation. Goal: catch any future PR that re-introduces a same-origin
// internal SSR fetch on a (app) page — the canonical pattern (host +
// x-forwarded-proto + cookies passthrough + fetch /api/v1/...) is what T3
// removed; resurrecting it would re-add one HTTP RTT + one Vercel function
// invocation per page render. The API routes themselves stay byte-identical
// for external callers + the authz matrix; only their use as an SSR
// proxy-fetch is forbidden on these six pages. This file rides Gate 10.

function read(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.resolve(process.cwd(), rel));
}

const PERF_PAGES: ReadonlyArray<{ id: string; rel: string }> = [
  { id: "T-UX-PERF-01", rel: "src/app/(app)/action-hub/page.tsx" },
  { id: "T-UX-PERF-02", rel: "src/app/(app)/dashboard/page.tsx" },
  { id: "T-UX-PERF-03", rel: "src/app/(app)/deliveries/page.tsx" },
  { id: "T-UX-PERF-04", rel: "src/app/(app)/invoices/page.tsx" },
  { id: "T-UX-PERF-05", rel: "src/app/(app)/notifications/page.tsx" },
  { id: "T-UX-PERF-06", rel: "src/app/(app)/treasury/page.tsx" },
];

const REQUIRED_API_ROUTES: ReadonlyArray<string> = [
  "src/app/api/v1/action-hub/route.ts",
  "src/app/api/v1/dashboard/route.ts",
  "src/app/api/v1/deliveries/route.ts",
  "src/app/api/v1/invoices/route.ts",
  "src/app/api/v1/notifications/route.ts",
  "src/app/api/v1/treasury/route.ts",
];

describe("UX hotfix pack — Tranche 3 performance contract", () => {
  for (const { id, rel } of PERF_PAGES) {
    it(`${id}: ${rel} must not contain a same-origin internal SSR fetch to /api/v1/`, () => {
      const c = read(rel);

      // Forbid the canonical ${protocol}://${host}/api/v1/... pattern that
      // every page used pre-T3. We detect both the template literal form
      // and the explicit `fetch("...api/v1/...")` form for completeness.
      expect(
        c,
        `${rel}: must not build a same-origin URL via protocol + host headers`,
      ).not.toMatch(/`\$\{protocol\}:\/\/\$\{host\}\/api\/v1\//);

      expect(
        c,
        `${rel}: must not call fetch() against /api/v1/* — use a direct service call wrapped in withRead instead`,
      ).not.toMatch(/fetch\([^)]*\/api\/v1\//);

      // The canonical pattern always reads x-forwarded-proto + host. If
      // either of those still appears on a page we converted, the SSR
      // fetch trick is likely back. Permit a comment explanation by
      // asserting against the live header-read calls only.
      expect(
        c,
        `${rel}: must not call hdrs.get("host") — that signals an SSR canonical-fetch revival`,
      ).not.toMatch(/hdrs\.get\(\s*["']host["']\s*\)/);

      expect(
        c,
        `${rel}: must not call hdrs.get("x-forwarded-proto") — same reason`,
      ).not.toMatch(/hdrs\.get\(\s*["']x-forwarded-proto["']\s*\)/);
    });
  }

  it("T-UX-PERF-07: every API route the SSR pages used to proxy still exists on disk", () => {
    // T3 removed the SSR proxy-fetch only. The API routes themselves must
    // continue to serve external clients + the authz matrix. If any of
    // these went missing, the integration suite would already turn red,
    // but this assertion documents the contract explicitly.
    for (const r of REQUIRED_API_ROUTES) {
      expect(exists(r), `API route still required on disk: ${r}`).toBe(true);
    }
  });

  it("T-UX-PERF-08: every converted page now imports withRead from @/db/client", () => {
    // Direct service calls go through withRead; the import is the cheapest
    // signal that the SSR path took the new shape. Anchored to import
    // statements (not arbitrary string occurrences) to avoid false positives.
    const importRegex = /import\s*\{[^}]*\bwithRead\b[^}]*\}\s*from\s*["']@\/db\/client["']/;
    for (const { rel } of PERF_PAGES) {
      const c = read(rel);
      expect(
        c,
        `${rel}: must import { withRead } from "@/db/client"`,
      ).toMatch(importRegex);
    }
  });
});
