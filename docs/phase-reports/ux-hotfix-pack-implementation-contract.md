# UX Hotfix Pack — Implementation Contract

> **Template**: D-78 §5 (13-section), composed for a 3-tranche pack with internal acceptance gates.
> **Type**: UI / shell / styles / page-read performance hardening. **No `src/db/**`, no business routes, no auth/permissions changes, no migrations, no schema, no new npm dependency unless absolutely necessary.**
> **Status**: **PENDING USER APPROVAL.** Sections 0–11 populated up-front; §12 + §13 only after each tranche lands.

---

## 0. Implementation Contract (pending acceptance)

**Problem statement.** Three field-observed UX defects on production are blocking pilot usability and need to be remediated together:

1. **RTL shell drift** — sidebar visually on the left (LTR-style), Topbar carries a dead breadcrumb placeholder, content area lacks a container, gutters/spacings inconsistent with `dir="rtl"`.
2. **Visual "wireframe" look** — default Tailwind greys + purple defaults + flat empty states. /notifications in particular reads as unfinished. Same flatness on /dashboard, /deliveries, /invoices, /treasury, /action-hub.
3. **Page-read latency** — heavy SSR pages (`/notifications`, `/dashboard`, `/deliveries`, `/invoices`, `/treasury`) execute a `fetch(http://host/api/v1/...)` round-trip from the server component. This is a same-origin internal HTTP hop that adds tens to hundreds of ms per request and burns one Vercel function invocation that already had the data via direct service call.

**In-scope guarantees.**
1. Three sequential tranches with internal acceptance per tranche; one local commit per tranche; deploy ONLY after Tranche 3 + full sweep + report.
2. Tranche 1: RTL shell mechanics (sidebar right rail, Topbar trim, dead breadcrumb removal, PageShell container contract, globals.css RTL invariants).
3. Tranche 2: Visual redesign — surface/border/text/active-nav tokens; intentional empty states; six pages adopt the language.
4. Tranche 3: Replace canonical same-origin SSR fetch with direct server-side service calls in five heavy pages. API routes stay byte-identical and continue to serve external + matrix-test consumers.
5. Two new regression files: `tests/regression/ui-shell-contract.test.ts` (Tranche 1 + 2) and `tests/regression/ui-performance-contract.test.ts` (Tranche 3) — both driven by simple AST/regex assertions on the touched files. Designed to fail loudly if a future PR re-introduces the dead breadcrumb, left-rail layout, or canonical same-origin fetch.

**Out-of-scope (explicit).**
- `src/db/**`, `src/db/schema/**`, `src/db/migrations/**` — zero touches.
- `src/app/api/**` business routes — zero touches.
- Permissions / authz / `requireRole` lists — zero touches.
- `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts` — zero touches (middleware was already updated in `094d8ec` for PWA assets; not part of this pack).
- `src/middleware-public.ts`, `src/middleware-headers.ts` — zero touches.
- `tests/integration/setup.ts` — byte-identical (carry-over reviewer constraint from P-audit-4 / P-audit-1 / P-audit-2).
- `vitest.config.ts` — no new excludes / no config change.
- `package.json` + `package-lock.json` — zero new dep.
- Mobile responsive shell — explicitly NOT in this pack. The Phase 6 audit flagged mobile=zero; that gap stays open and is its own future tranche. Section 6 of the executive brief lists "mobile collapse إن كان موجودًا" as observational only.
- Playwright / E2E — out (P-audit-3 territory; Flow 01 login HTTP round-trip debt remains open).
- countUnread call in `(app)/layout.tsx` — NOT touched in Tranche 3 unless live profiling proves a bottleneck. If profiling surfaces it, that becomes its own tranche, not a creep into this one.

**Explicit non-guarantees.**
- "Visual redesign" is bounded to surface/border/text/empty-state tokens + the six listed pages. Other pages inherit the AppShell change but do NOT receive bespoke styling beyond the shared language.
- "Performance hardening" is the SSR-fetch removal only. No DB query optimisation, no new indexes, no caching layer.
- No before/after Lighthouse numbers committed; observational latency comparison recorded in §11.

---

## 1. Tranche ID

- **Date**: TBD — filled at each tranche's commit time.
- **Local working baseline**: `094d8ec` (`fix(pwa): keep manifest and service worker public`).
- **Production baseline**: actual current production is `dpl_Ex1yF4smWcvuNAdFoupBPdTyuA75` deployed from `094d8ec` (the PWA fix went live during the prior session). The executive brief said `f1aa900 / dpl_GxDuoWHbarCeB1AZzpapj59fzXRR`; flagging the discrepancy here so the operator can confirm or correct. Either way, this pack adds no new deploy until the closing of Tranche 3 + full sweep.
- **Phase**: **UX Hotfix Pack** (3 tranches: T1 RTL shell, T2 Visual redesign, T3 Performance hardening).

---

## 2. Scope

### Tranche 1 — RTL Shell Fix

**Touch (all paths under `src/components/layout` + `src/components/ui` + `src/app/globals.css`):**
- `src/components/layout/AppLayout.tsx` — flip `flex-row-reverse` semantics → drop the row-reverse trick + use Tailwind logical RTL utilities; ensure content area gets a `max-w` + `mx-auto` container; gutter parity with the new sidebar.
- `src/components/layout/Sidebar.tsx` — keep right rail (already `border-l` works in RTL because `border-l` on a `dir=rtl` viewport renders on the visual right; existing `dir=rtl` html). Verify alignment + active-state styling. No structural rewrite — the layout is already RTL-correct in markup; the issue is content-area gutters + container.
- `src/components/layout/Topbar.tsx` — remove dead breadcrumb placeholder; rebalance `welcome name + bell + theme toggle + sign-out` ordering. NO new actions added.
- `src/components/ui/PageShell.tsx` — make the contract explicit: `<header><h1/></header><div class="container">{children}</div>`. Container width = `max-w-7xl mx-auto`. Add a `data-page-shell` attribute for the regression guard.
- `src/app/globals.css` — `html { direction: rtl }` already there; add page-shell container + a `:where(html[dir="rtl"]) .x` rule pattern for any class that needs RTL-flip.

**NOT touched in T1**: any `src/app/(app)/*/page.tsx`, any `src/modules/**`, any test file outside the new regression guard.

### Tranche 2 — Visual Redesign

**Touch:**
- `src/app/globals.css` — add `@theme` extensions for surface/border/text tokens (Tailwind v4 native; no new dep). Define active-nav state + hover/focus rings.
- `src/components/layout/Sidebar.tsx` — apply the new token classes; intentional active-state pill / left-edge accent.
- `src/components/layout/Topbar.tsx` — token application; cleaner action buttons.
- `src/components/ui/PageShell.tsx` — header treatment + subtitle hierarchy.
- Six page client components, edited only where the visual language needs to land:
  - `src/app/(app)/notifications/*` — empty state + filter bar + counts treatment.
  - `src/app/(app)/dashboard/DashboardClient.tsx` — KPI card visual.
  - `src/app/(app)/deliveries/DeliveriesListClient.tsx` — table row hover + filter bar.
  - `src/app/(app)/invoices/InvoicesListClient.tsx` — same row + filter treatment.
  - `src/app/(app)/treasury/TreasuryViewClient.tsx` — accounts/movements table consistency.
  - `src/app/(app)/action-hub/ActionHubClient.tsx` — three sections cohesion.

**NOT touched in T2**: any `src/modules/**`, route handlers, schemas, services, business logic.

### Tranche 3 — Performance Hardening

**Touch:**
- `src/app/(app)/notifications/page.tsx` — replace `fetch(/api/v1/notifications)` SSR fetch with direct call into `src/modules/notifications/service` + `withRead`. (Notifications page must already exist; if it's a thin component, fewer lines change.)
- `src/app/(app)/dashboard/page.tsx` — replace `fetch(/api/v1/dashboard)` with `getDashboard(...)` from `src/modules/dashboard/service` + `withRead` + role claims.
- `src/app/(app)/deliveries/page.tsx` — replace `fetch(/api/v1/deliveries)` with `listDeliveries(...)` from `src/modules/deliveries/list`.
- `src/app/(app)/invoices/page.tsx` — replace `fetch(/api/v1/invoices)` with `listInvoices(...)` from `src/modules/invoices/service`.
- `src/app/(app)/treasury/page.tsx` — replace `fetch(/api/v1/treasury)` with `listTreasury(...)` from `src/modules/treasury/service`.

**Constraint**: response shape returned to the client renderer stays IDENTICAL (extracted from the existing canonical-fetch JSON); no DTO rename, no field add/remove.

**Optional 6th**: `src/app/(app)/action-hub/page.tsx` — same pattern with `loadActionHubPayload(...)`. Only if the regression file's perf checks warrant it; otherwise stays in T2 visual scope only.

**NOT touched in T3**: API route handlers (they continue to serve external clients + the authz matrix probe). Service / module code unchanged. countUnread in `(app)/layout.tsx` unchanged.

### Asserted not-touched across the whole pack (§7 regression)

- `src/db/**`, `src/db/schema/**`, `src/db/migrations/**` — zero lines.
- `src/app/api/**` (any route handler) — zero lines.
- `src/middleware.ts`, `src/middleware-public.ts`, `src/middleware-headers.ts` — zero lines.
- `src/auth.ts`, `src/auth.config.ts` — zero lines.
- `src/lib/session-claims.ts`, `src/lib/api-errors.ts` — zero lines.
- `src/modules/**` — zero lines (only consumed via existing exports).
- `tests/integration/setup.ts` — zero lines.
- `tests/integration/**`, `tests/authz/**`, existing `tests/regression/*.test.ts` — zero lines (new regression files added in tests/regression/, do NOT modify the existing 3).
- `vitest.config.ts` — zero lines.
- `package.json`, `package-lock.json` — zero lines.

---

## 3. Files

### Tranche 1 — Planned (new + modified)

| File | Op | Target LOC |
|------|----|:---:|
| `src/components/layout/AppLayout.tsx` | modify | ≤ 60 |
| `src/components/layout/Sidebar.tsx` | modify | ≤ 110 |
| `src/components/layout/Topbar.tsx` | modify | ≤ 90 |
| `src/components/ui/PageShell.tsx` | modify | ≤ 50 |
| `src/app/globals.css` | modify | ≤ 100 |
| `tests/regression/ui-shell-contract.test.ts` | NEW | ≤ 220 |

### Tranche 2 — Planned (modify only — no new files for visual)

| File | Op | Approx LOC change |
|------|----|:---:|
| `src/app/globals.css` | modify (add tokens) | +30 |
| `src/components/layout/Sidebar.tsx` | modify (token application) | +20 / -10 |
| `src/components/layout/Topbar.tsx` | modify | +15 / -10 |
| `src/components/ui/PageShell.tsx` | modify (header treatment) | +10 / -5 |
| 6 page client files (above) | modify (token application) | ~+15 / -10 each |

### Tranche 3 — Planned (modify only)

| File | Op | Notes |
|------|----|---|
| `src/app/(app)/notifications/page.tsx` | modify | replace SSR fetch with service call |
| `src/app/(app)/dashboard/page.tsx` | modify | same |
| `src/app/(app)/deliveries/page.tsx` | modify | same |
| `src/app/(app)/invoices/page.tsx` | modify | same |
| `src/app/(app)/treasury/page.tsx` | modify | same |
| `tests/regression/ui-performance-contract.test.ts` | NEW | ≤ 100 |
| `src/app/(app)/action-hub/page.tsx` | modify (optional, see Q2) | same pattern |

### Final report

| File | Op |
|------|----|
| `docs/phase-reports/ux-hotfix-pack-report.md` | NEW (post-T3) |

---

## 4. Dependencies

**Pre-existing, reused unchanged:**
- `src/modules/notifications/service.ts` → list helper (T3).
- `src/modules/dashboard/service.ts` → `getDashboard` (T3).
- `src/modules/deliveries/list.ts` → `listDeliveries` (T3).
- `src/modules/invoices/service.ts` → `listInvoices` (T3).
- `src/modules/treasury/service.ts` → `listTreasury` (T3).
- `src/modules/action-hub/service.ts` → `loadActionHubPayload` (T3, optional).
- `src/db/client.ts` → `withRead` (T3).
- `src/lib/session-claims.ts` → `enforcePageRole`, `getSessionClaims` (T3).
- Tailwind v4 `@theme` syntax (existing in globals.css; T2 extends it).

**No new npm dependency. Lockfile diff = empty.**

---

## 5. Integration Points

- **Server-side fetch removal (T3)**: pages consume the SAME service functions the API routes consume. DTO shape preserved at the page-render boundary. Authz matrix (P-audit-2) continues to validate the API path; the page now uses a direct path that's a strict subset of the route's logic.
- **Regression guards (T1 + T3)**: structural assertions on the touched files using `fs.readFileSync` + regex, not Playwright / DOM rendering. Cheap to run; live in `tests/regression/` so they ride Gate 10.
- **PWA / middleware** (`094d8ec`): not affected — content-type response unchanged.
- **CI Gate 6 / 9 / 10** (P-audit-4 / 1 / 2 hard-fail behaviour): preserved; no script-line changes to `package.json` test commands.

---

## 6. Test Plan (per-tranche internal acceptance)

### 6.a — Tranche 1 gates (run after T1 code lands; commit only after all green)

```
npm run lint
npm run typecheck
npm run build
npm run db:migrate:check
npm run test:unit
npm run test:integration
npm run test:regression
npm run test:authz
```

### 6.b — Tranche 1 regression guard (`tests/regression/ui-shell-contract.test.ts`)

≥ 8 assertions, all `fs`-based (no DB):

- `T-UX-SHELL-01` `AppLayout.tsx` does NOT contain literal `flex-row-reverse` (left-rail trick).
- `T-UX-SHELL-02` `AppLayout.tsx` includes a content-area container marker (`max-w-`).
- `T-UX-SHELL-03` `Topbar.tsx` does NOT contain the dead breadcrumb placeholder string.
- `T-UX-SHELL-04` `Topbar.tsx` includes the four canonical action elements (welcome name, bell, theme toggle, sign-out) by stable selector strings.
- `T-UX-SHELL-05` `Sidebar.tsx` retains a `border-l` (RTL: visual right edge) marker.
- `T-UX-SHELL-06` `PageShell.tsx` exports a contract carrying `data-page-shell` attribute.
- `T-UX-SHELL-07` `globals.css` has `html { direction: rtl }`.
- `T-UX-SHELL-08` page-shell container width contract present in `globals.css` OR `PageShell.tsx`.

### 6.c — Tranche 2 gates (same 8-gate sweep)

No new test file. The shell-contract from T1 stays valid + extends with optional token presence checks (e.g., `globals.css` has the new token names) — added incrementally inside the same regression file under a `T-UX-VIS-*` section if needed.

### 6.d — Tranche 3 gates (same 8-gate sweep)

### 6.e — Tranche 3 regression guard (`tests/regression/ui-performance-contract.test.ts`)

≥ 6 assertions:

- `T-UX-PERF-01..05` for each of the 5 page files: must NOT contain `fetch(\`${protocol}://${host}/api/v1/`. Use a precise regex (the same canonical-fetch pattern Phase 5.3 / 6.2 / 6.3 / 6.4 used).
- `T-UX-PERF-06` API routes still exist on disk (`src/app/api/v1/{notifications,dashboard,deliveries,invoices,treasury}/route.ts`).

### 6.f — Acceptance threshold (per tranche, non-negotiable)

- All 8 gates green for that tranche.
- No infra-flake retry exceeds **2 attempts** per failing file (per the audit Debug Order).
- `npm run test:regression` includes the new guard files post-T1 / post-T3.
- Cross-tranche: `test:integration` baseline 450 stays unchanged in count + green; `test:authz` 110 stays; `test:regression` count = previous + new.

### 6.g — Manual smoke (per executive brief §6, after T2 lands and again after T3)

Recorded in §12 of this Contract / final report:
- /action-hub, /notifications, /dashboard, /deliveries, /invoices, /treasury — each page screen-checked for: RTL alignment, sidebar right rail, Topbar balance, empty-state quality, visual contrast.
- Hydration flicker: visually confirmed absent (or noted if present).
- No new redirects.
- Latency observed (rough, not timed): "feels faster" or noted otherwise.

### 6.h — Final post-deploy smoke (executive §6 second part)

After Tranche 3 close + deploy:
- /login → /action-hub
- /orders, /deliveries, /invoices, /treasury, /settlements end-to-end UI.
- After first real `confirm-delivery` produces an invoice: PDF download + `/invoices/[id]/print`.

---

## 7. Regression Coverage

- **Shell contract** (T1): structural fs/regex assertions catch any future PR that re-introduces left-rail or dead breadcrumb.
- **Performance contract** (T3): structural fs/regex assertions catch any future PR that re-introduces canonical same-origin SSR fetch on the 5 pages.
- **API surface unchanged**: existing P-audit-2 authz matrix (110 cells) continues to assert the route handlers; if T3's service-call refactor accidentally breaks the API path, matrix turns red.
- **Behaviour preserved**: existing 450 integration tests + 25 regression tests + 17 unit + ci-guards continue to gate.

---

## 8. API Impact

**None.** Zero route handler touched. No endpoint added/removed/changed. External clients + the authz matrix continue to call the same surface byte-identically.

---

## 9. DB Impact

**None.** No migration, no schema, no seed change.

---

## 10. Security Check

- `enforcePageRole(...)` continues to gate every (app) page — T3 does NOT remove the role check; it only replaces the canonical-fetch with a service call AFTER role enforcement.
- No new env, no new logger surface.
- `getSessionClaims()` continues to authenticate the request before any service call.
- T1 + T2 are CSS/markup; no security surface.

---

## 11. Performance Check

- **Objective**: each of the 5 heavy pages drops one same-origin HTTP round-trip per request. Saves ~1 RTT + ~1 Vercel function invocation count per page render.
- **Budget**: not formally measured pre/post in this pack. Operator-observed latency improvement recorded in §12 manual smoke.
- **No regression risk**: the service functions are the SAME ones the API routes call; they are integration-tested by the existing 450 cases.

---

## 12. Self-Review Findings

### Tranche 1 — RTL Shell Fix (closed 2026-04-25)

**Files actually touched (3 modified + 1 new):**
- `src/components/layout/AppLayout.tsx` — dropped `flex-row-reverse`, refreshed comment.
- `src/components/layout/Topbar.tsx` — removed dead breadcrumb placeholder div, reordered actions to source-order { welcome, bell, theme, sign-out }.
- `src/components/ui/PageShell.tsx` — added `data-page-shell` marker + `mx-auto max-w-7xl` container.
- `tests/regression/ui-shell-contract.test.ts` — NEW, 8 assertions.

**Files NOT touched in T1** (planned but unnecessary): `src/components/layout/Sidebar.tsx` (existing `border-l` + `w-64` already correct after AppLayout fix; the regression guard checks them on disk), `src/app/globals.css` (existing `direction: rtl` sufficient; visual tokens come in T2). Net diff narrower than the contract budget — flagged here so the "files modified" count is honest.

**What I checked**:
- The root cause of "sidebar on visual left" was `flex-row-reverse` double-reversing under `<html dir=rtl>`. Removed; the markup order { Sidebar, ContentColumn } now flows inline-start → inline-end which under RTL is right → left, putting Sidebar on the visual right. Sidebar's existing `border-l` (physical left edge of element) becomes the inner separator. No code change needed in Sidebar itself.
- The Topbar dead gap was a Phase-3 stub `<div>{/* breadcrumbs Phase 3 */}</div>` paired with `justify-between`. Removed both; replaced with `gap-4` and source-order children.
- PageShell now constrains content to a centered 7xl container. Pages already wrapped in PageShell (dashboard, action-hub, invoices, treasury, deliveries) inherit automatically — zero touch to those page files in T1.

**Invariants-to-proof mapping**:

| Invariant | Proof |
|-----------|-------|
| AppLayout JSX no longer carries `flex-row-reverse` | `T-UX-SHELL-01` (className-aware regex; comments mentioning the historical name remain permitted) |
| AppLayout retains canonical `h-screen + flex` shell | `T-UX-SHELL-02` |
| Topbar has no breadcrumb-placeholder div | `T-UX-SHELL-03` (matches the JSX-form pattern, not header comments) |
| Topbar action source order is { welcome, bell, theme, sign-out } | `T-UX-SHELL-04` (anchored to `<header` JSX, ignores imports + header comments) |
| Sidebar retains right-rail invariants (`border-l` + `w-64`) | `T-UX-SHELL-05` |
| PageShell carries the structural marker | `T-UX-SHELL-06` |
| PageShell centers content in `max-w-7xl` | `T-UX-SHELL-07` |
| `globals.css` enforces `html { direction: rtl }` | `T-UX-SHELL-08` |

**Gates run + outcomes**:

| Gate | Result | Notes |
|------|--------|-------|
| lint | ✓ | 1 pre-existing warning (managerBId in phase-5.3-test) — not introduced by T1 |
| typecheck | ✓ | — |
| build | ✓ | all routes generated as expected |
| db:migrate:check | ✓ | — |
| test:unit + coverage | ✓ | 83.10 / 82.43 / 89.87 / 83.84 — slight ↑ vs yesterday's audit due to no module changes here |
| test:regression | ✓ (after first run) | 33/33 (25 baseline + 8 new T1 guard) — initial run had 2 of my regression-test bugs (regex matched comments / imports); refined to className-only and JSX-anchored selectors; rerun green |
| test:authz | ✓ | 110/110 unchanged |
| test:integration | ✓ (after 1 isolated rerun) | first full run: 1 file failed (`phase-5.5-polish.test.tsx`) with the same `Connection terminated → [0].id undefined` Neon cold-start cascade signature documented in yesterday's audit; isolated rerun → 9/9 green. Classified **infra flake**, not a T1 regression. |

**Manual smoke**: deferred to T2 close — T1 is structural plumbing only; no observable visual change beyond "sidebar moved to the right + dead gap gone". Operator UI test covers it then.

**Known limitations (non-blocking)**:
1. The contract listed 5 modified files for T1; reality is 3. Files (Sidebar.tsx, globals.css) had no functional T1 change to make beyond what was already correct on disk. Reported transparently here rather than padded with no-op edits.
2. Mobile responsive shell remains out of scope (Q3 confirmed).
3. countUnread call in `(app)/layout.tsx` not touched (Q-extra confirmed; deferred to live-profiling decision).

---

## 13. Decision

*(Filled by reviewer after each tranche.)*

### Conditions for acceptance (pre-stated, all three tranches)
1. All 8 gates green per tranche.
2. New regression guard files (`ui-shell-contract.test.ts` + `ui-performance-contract.test.ts`) green and cover the listed assertions.
3. Manual smoke green per executive §6.
4. `git diff --stat` against declared not-touched paths = empty.
5. `tests/integration/setup.ts` byte-identical (carry-over reviewer constraint).
6. Zero new npm dependency.
7. Local commits only — no push, no deploy until after T3 + final sweep.

### Final pack acceptance (post-T3)
8. PDF + print smoke green AFTER first real `confirm-delivery` produces an invoice (operator action; not blocking deploy).

---

## Appendix — Open questions for reviewer (block on answer before code)

- **Q1 — Visual token system**: Tailwind v4 `@theme` extension with CSS variables, or hand-rolled class-based tokens? Default: **`@theme`** — already used in `globals.css`; zero new dep; consistent with Phase 5.5 dark-mode polish.
- **Q2 — `/action-hub` perf scope**: include in Tranche 3 (becomes 6 pages) or keep in T2 visual only (5 pages)? Default: **include in T3** — Phase 6.2 page already uses canonical-fetch; consistent with the other 5; ~30 LOC change.
- **Q3 — Mobile responsive**: explicitly excluded from this pack? Brief §6 mentions mobile only as observation. Default: **out of scope** for the hotfix pack; flagged as separate future tranche when operator decides.
- **Q4 — Tranche 3 service-call wrapper**: pages import the existing module exports directly (`import { getDashboard } from "@/modules/dashboard/service"`), or wrap via a new `src/lib/server-page-fetch.ts` helper? Default: **direct module import** — fewer files, narrower diff, matches the Phase 6 SSR pattern already used by the API routes.
- **Q5 — Commit policy**: single commit per tranche (3 commits total + final report commit), OR a single squash commit at end? Default: **per-tranche commit** — preserves bisect-ability per the project's standing convention.

Reviewer response needed before any file is written.
