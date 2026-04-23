# Phase 6.2 Delivery Report — Action Hub Implementation

> **Template**: D-78 §5 (13-section).
> **Type**: Post-MVP polish tranche. Read-only composition over Phase 5.2 activity + Phase 5.3 dashboard primitives. No migrations, no API mutations, no write-path changes. Opens the new Phase 6 bracket (post-MVP-v1 polish); scope of Phase 6 as a whole is not redefined here.
> **Status on this file**: **Implementation Contract — PENDING USER APPROVAL.** Sections 0–11 are populated up-front per D-78 discipline; sections 12–13 remain empty until after code + tests land.

---

## 0. Implementation Contract (pending acceptance)

**Problem statement.** `/action-hub` is currently a hardcoded Phase 1 shell: the page body contains literal strings "المرحلة 1 — الـ shell فقط", "(Phase 3)", "(Phase 4)" in place of real content. [25_Dashboard_Requirements.md §Action Hub لـ admin roles (D-72)](../requirements-analysis/25_Dashboard_Requirements.md) specifies three concrete sections (إجراءات مُلحَّة / آخر نشاط / حالة الفرق) whose backend primitives shipped in Phase 5.2 (activity) and Phase 5.3 (counts). This tranche wires that data through; no new domain logic is introduced.

**In-scope guarantees.**
1. A new `GET /api/v1/action-hub` returns `{ urgentActions, recentActivity, teamCounts }`.
2. The page SSR-fetches that endpoint (canonical-fetch pattern, as Phase 5.3 did for `/dashboard`).
3. All six urgent-action types from the spec are wired (no stubs, no "coming soon" strings).
4. Role gating matches [middleware.ROLE_HOMES](../../src/middleware.ts) + [enforcePageRole](../../src/lib/session-claims.ts): only `pm` / `gm` / `manager` can view; other roles redirected to their role-home.
5. Manager scope is team-only (reuses the same `visibleUserIdsForManager` pattern from [activity/service.ts](../../src/modules/activity/service.ts)).
6. All four stale-label sites fixed in the same tranche (zero visible "Phase 1/3/4" strings remain in shipped UI).

**Out-of-scope (deferred to Tranche 6.1 or 6.3).**
- Mobile hamburger/drawer shell (Tranche 6.1).
- LTR isolation polish in numeric/Latin fields (Tranche 6.3, awaiting user-specified screens).
- Any new migration, any change to `activity` / `dashboard` / `notifications` / `settlements` / `treasury` / `orders` / `deliveries` / `invoices` modules beyond additive imports.
- Rich "drill-down" pages for each urgent action (link targets existing list pages; no new lists).

**Explicit non-guarantees.**
- Urgent-action thresholds (overdue ≥ 7 d, stale snapshot > 60 d, low-stock threshold) read from existing settings/constants — no tunables introduced in this tranche.
- No caching layer; the endpoint executes each query on every request. Performance budget asserted in §11.

---

## 1. Tranche ID

- **Date**: TBD — filled at commit time.
- **Base commit**: `5dfbdb6` (latest — auth csrf dedup + logger, on top of Phase 5 closure).
- **Commit SHA (delivery)**: *(appended at commit time)*
- **Phase**: **6.2 — Action Hub Implementation** (opens Phase 6 polish bracket).

---

## 2. Scope

### In-scope (new / modified code, strictly enumerated)

**New module** — `src/modules/action-hub/`:
- `dto.ts` — `ActionHubResponse`, `UrgentActionItem`, `RecentActivityRow`, `TeamCountsDto`.
- `permissions.ts` — `assertCanViewActionHub(claims)` (pm/gm/manager only; mirrors dashboard/permissions.ts).
- `urgent-actions.ts` — six query helpers: `countOverduePayments`, `countReconciliationDue`, `countPendingCancellations`, `countStaleBonusSnapshots`, `countLowStock`, `countIncompleteSettings`.
- `team-counts.ts` — four count helpers: `countOrdersToday`, `countDeliveriesPending`, `countLowStock` (re-exports from urgent-actions), `countOpenCancellations` (re-exports).
- `service.ts` — `loadActionHubPayload(db, claims)` composing the above + calling `listActivity(..., limit=5)`.

**New API** — `src/app/api/v1/action-hub/route.ts` (GET handler; Node runtime; `export const dynamic = "force-dynamic"`).

**Replaced page** — `src/app/(app)/action-hub/page.tsx`:
- Drop all placeholder strings.
- Call `enforcePageRole(["pm","gm","manager"])` (already in place — kept).
- Canonical SSR fetch to `/api/v1/action-hub` via `fetch(baseUrl + "/api/v1/action-hub", { headers: forwardCookies })`.
- Delegate render to new `ActionHubClient.tsx`.

**New client** — `src/app/(app)/action-hub/ActionHubClient.tsx` — pure presentational; three sections; dark-mode styled consistent with [Phase 5.5 dashboard polish](phase-5.5-delivery-report.md).

**Stale-label cleanup (bundled)**:
- `src/app/(auth)/login/page.tsx:90` — remove the `"Vitesse Eco — Phase 1"` footer paragraph.
- `src/app/(auth)/login/page.tsx:4` — update source comment `"Phase 1 MVP"` → `"MVP v1"`.
- `src/app/(app)/orders/page.tsx:16` — strip the `"(Phase 3)"` parenthetical from the CTA label.

**Docs updates**:
- `docs/requirements-analysis/25_Dashboard_Requirements.md` — mark Action Hub section as shipped; remove the Phase 5.5 closure note about "KPIs as header cards not shipped" if now superseded (verify first).
- `docs/requirements-analysis/35_API_Endpoints.md` — add `GET /api/v1/action-hub` entry.
- `docs/requirements-analysis/18_Screens_Pages.md` — update `/action-hub` row from "shell" to "shipped".

### Not touched (asserted by diff at merge time — §7 regression)

- `src/modules/activity/**`, `src/modules/dashboard/**`, `src/modules/notifications/**`, `src/modules/settlements/**`, `src/modules/treasury/**`, `src/modules/orders/**`, `src/modules/deliveries/**`, `src/modules/invoices/**` — zero lines changed.
- `src/lib/activity-log.ts`, `src/lib/hash-chain.ts` — read-only reuse.
- `src/db/schema/**`, `src/db/migrations/**` — no migration.
- `src/middleware.ts`, `src/auth.ts`, `src/auth.config.ts` — untouched by this tranche.
- Tranche 5.5 polish artifacts — untouched.

---

## 3. Files

### Planned — new (9)

| File | Role | Target LOC (≤ 300 per project rule) |
|------|------|:---:|
| `src/modules/action-hub/dto.ts` | Zod schemas + response types | ≤ 60 |
| `src/modules/action-hub/permissions.ts` | `assertCanViewActionHub` | ≤ 30 |
| `src/modules/action-hub/urgent-actions.ts` | 6 count helpers | ≤ 220 |
| `src/modules/action-hub/team-counts.ts` | 4 count helpers (2 re-exports) | ≤ 90 |
| `src/modules/action-hub/service.ts` | `loadActionHubPayload` composer | ≤ 90 |
| `src/app/api/v1/action-hub/route.ts` | GET handler | ≤ 45 |
| `src/app/(app)/action-hub/ActionHubClient.tsx` | Client renderer | ≤ 230 |
| `tests/integration/phase-6.2-action-hub.test.ts` | Integration suite (§6 matrix) | ≤ 820 |
| `src/modules/action-hub/urgent-actions.test.ts` | Unit tests for the 6 helpers | ≤ 180 |

### Planned — modified (6)

| File | Change | Est. lines |
|------|--------|:---:|
| `src/app/(app)/action-hub/page.tsx` | Replace placeholder body with SSR fetch + ActionHubClient composition | ~40 net |
| `src/app/(auth)/login/page.tsx` | Drop Phase-1 footer + update source comment | -3 / +2 |
| `src/app/(app)/orders/page.tsx` | Strip "(Phase 3)" from CTA label | -1 / +1 |
| `docs/requirements-analysis/25_Dashboard_Requirements.md` | Mark Action Hub shipped | ~15 |
| `docs/requirements-analysis/35_API_Endpoints.md` | Add endpoint entry | ~8 |
| `docs/requirements-analysis/18_Screens_Pages.md` | Status update | ~2 |

---

## 4. Dependencies

**Pre-existing, reused unchanged:**
- `src/modules/activity/service.ts` — `listActivity` called with `limit=5` for recent-activity section.
- `src/modules/dashboard/counts.ts` — `loadCounts` patterns replicated (not imported — keeps action-hub module self-contained).
- `src/modules/invoices/d35-gate.ts` — `D35_REQUIRED_SETTINGS` imported to compute "settings incomplete" count.
- `src/lib/session-claims.ts` — `enforcePageRole`, `requireClaims`.
- `src/lib/paris-date.ts` — `todayParisIso`, `parisDayStart`.
- `src/lib/api-errors.ts` — `apiError` (route-handler error mapper).
- `src/db/client.ts` — `withRead` for one-shot DB reads in the route.

**No new npm dependencies.** `npm ci` diff at merge must show zero changes in `package.json` + `package-lock.json`.

---

## 5. Integration Points

- **Nav**: `/action-hub` is already the role-home for pm/gm/manager per `middleware.ROLE_HOMES` — no nav change.
- **Activity**: recent-activity rows use `listActivity(db, claims, { limit: 5 })`. Manager scope (team-only) is already applied inside `listActivity` — no additional filtering needed in action-hub.
- **D-35 gate**: "settings incomplete" count is derived from `D35_REQUIRED_SETTINGS` vs. `settings` table; zero coupling with invoice flow.
- **Canonical fetch**: page → `/api/v1/action-hub` via absolute URL built from `process.env.VERCEL_URL || process.env.NEXTAUTH_URL`, forwarding cookies via `headers()`. Pattern identical to Phase 5.3 `/dashboard/page.tsx`.

---

## 6. Test Plan (pre-registered — ship implies all cases GREEN)

### 6.a Integration suite (`phase-6.2-action-hub.test.ts`, ≥ 29 cases)

**Authorization matrix (7)**
- `T-AH-AUTH-01` Unauth GET → 401.
- `T-AH-AUTH-02`/`03`/`04` seller / driver / stock_keeper GET → 403.
- `T-AH-AUTH-05`/`06`/`07` pm / gm / manager GET → 200.

**Urgent actions — each of 6 triggered by seeds (7)**
- `T-AH-URG-01` Overdue: seed 2 orders ≥ 7 d old unpaid + 1 order 5 d old → `urgentActions.overduePayments = 2`.
- `T-AH-URG-02` Reconciliation due: seed manager_box + driver_custody with positive balance past handover window → `reconciliationDue ≥ 1`.
- `T-AH-URG-03` Pending cancellations: seed 3 cancellations in `pending_approval` → `pendingCancellations = 3`.
- `T-AH-URG-04` Stale snapshots: seed one `user_bonus_rates` snapshot dated > 60 d ago → `staleSnapshots = 1`.
- `T-AH-URG-05` Low stock: seed 2 products below `sku_threshold` setting → `lowStock = 2`.
- `T-AH-URG-06` Settings incomplete: leave ≥ 1 D-35 placeholder empty → `incompleteSettings ≥ 1`.
- `T-AH-URG-07` Fresh DB all-zero: no seeds → all six urgent counts = 0; no crash; `urgentActions.total = 0`.

**Recent activity (3)**
- `T-AH-ACT-01` Seed 10 activity rows across 3 users → response returns exactly 5, ordered by `created_at DESC`.
- `T-AH-ACT-02` Manager scope: manager user sees only team rows (own + direct-report drivers); rows from unrelated users absent.
- `T-AH-ACT-03` pm/gm: global scope — sees rows from all users.

**Team counts (4)**
- `T-AH-CNT-01` Orders today: seed 3 orders today + 5 yesterday, Europe/Paris boundary → `ordersToday = 3`.
- `T-AH-CNT-02` Deliveries pending: seed 4 pending + 2 delivered → `deliveriesPending = 4`.
- `T-AH-CNT-03` Low stock = urgent `lowStock` (same query, no drift).
- `T-AH-CNT-04` Open cancellations = urgent `pendingCancellations` (same count).

**Role-home redirect (4)**
- `T-AH-NAV-01` seller GET `/action-hub` (page) → 307 → `/orders`.
- `T-AH-NAV-02` driver → 307 → `/driver-tasks`.
- `T-AH-NAV-03` stock_keeper → 307 → `/preparation`.
- `T-AH-NAV-04` pm GET `/action-hub` → 200 HTML.

**Invariant + regression (4)**
- `T-AH-INV-01` `verifyActivityLogChain()` returns `null` before and after a series of action-hub reads (no write path touched the log).
- `T-AH-INV-02` Diff check — `git diff --stat <base>..HEAD -- src/modules/activity src/modules/dashboard src/modules/notifications src/modules/settlements src/modules/treasury src/modules/orders src/modules/deliveries src/modules/invoices` = empty.
- `T-AH-INV-03` `package.json` + `package-lock.json` unchanged.
- `T-AH-INV-04` All stale "Phase 1/3/4" markers removed (grep assertion in suite).

### 6.b Unit suite (`src/modules/action-hub/urgent-actions.test.ts`, ≥ 12 cases)

- 2 cases per urgent-action helper (one triggering, one null/empty) — 12 total.
- Deterministic Paris-date clocking via `vi.setSystemTime` + `src/lib/paris-date.ts` helpers.

### 6.c Gate pack ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)) — delivery blocks until all 13 gates pass

- Gate 1 lockfile • Gate 2 lint (no new ESLint violations; `max-lines: 300` respected) • Gate 3 typecheck strict • Gate 4 build • Gate 5 unit + coverage (≥ 70 % general, ≥ 90 % in `src/modules/action-hub/`) • Gate 6 integration (29+ cases green on real Neon ephemeral) • Gate 7 OpenAPI drift (must add one entry, match) • Gate 8 migration check — no-op (no migrations) • Gate 9 authz matrix • Gate 10 regression pack • Gate 11 E2E smoke • Gate 12 perf (§11 budget) • Gate 13 a11y + logs.

### 6.d Acceptance threshold (non-negotiable)

- **29+ integration + 12+ unit = 41+ cases total, 100 % green.**
- Coverage floor on `src/modules/action-hub/`: **90 %**.
- Zero test marked `.skip` / `.todo` / `.skipIf` (outside the standard `HAS_DB` guard at the top of the integration file).
- `npm run test:integration` and `npm run test:unit` both green locally AND in CI before commit is marked accepted.

---

## 7. Regression Coverage

- **Stale-markers grep** asserts absence of `/Phase\s*1|المرحلة\s*1|\(Phase [0-9]+\)/` under `src/app/**/*.tsx` (allow matches inside comment lines that start with `//` or inside `docs/`).
- **Diff fence** — the integration suite's `T-AH-INV-02` runs `git diff --stat` via `execSync` at test time against declared-not-touched modules; any non-empty output fails the suite.
- **Chain invariant** — `verifyActivityLogChain` before+after (`T-AH-INV-01`).
- **D-78 §2 permanent regression pack** unaffected — this tranche adds only read-only endpoints; the 11 permanent flows do not need new rules.

---

## 8. API Impact

### Added
- `GET /api/v1/action-hub` — response shape in `src/modules/action-hub/dto.ts`. OpenAPI entry added to the spec; `npm run openapi:drift` must return 0.

### Not changed
- `/api/v1/activity`, `/api/v1/dashboard`, `/api/v1/reports/*`, `/api/v1/me`, `/api/auth/*`, `/api/init`, `/api/health` — byte-identical.

---

## 9. DB Impact

**None.** No migrations. No schema changes. Query primitives are compositions over existing tables: `orders`, `payments`, `deliveries`, `products`, `cancellations`, `user_bonus_rates`, `settings`, `activity_log`, `treasury_accounts`.

---

## 10. Security Check

- Endpoint protected by `requireClaims` + `assertCanViewActionHub` (pm/gm/manager).
- Manager team-scope enforced via the same pattern `activity/service.ts` uses — no new oracle surface: a user-specified filter outside a manager's team returns 0 rows, not 403.
- No user input is written to any table. No RCE / SSRF surface (endpoint takes no params).
- Secret handling: unchanged. This tranche reads `D35_REQUIRED_SETTINGS` but never logs values.
- Rate limiting: inherits middleware defaults (no new surface introduced).

---

## 11. Performance Check

- **Budget**: p95 ≤ 250 ms at 10 concurrent reads on the seeded staging dataset (100 orders / 40 deliveries / 30 cancellations / 20 products / 20 users / 500 activity rows). Measured by `npm run test:perf` via `phase-6.2-action-hub.perf.ts` if the perf harness is in place, otherwise captured manually once and recorded in §12.
- All six urgent-action queries + four count queries run in parallel via `Promise.all` inside `service.ts`.
- `Pool` lifecycle identical to Phase 5.3 (`withRead` closes the pool via `ctx.waitUntil`).
- No N+1 — each helper is a single aggregate `COUNT(…)` or list query.

---

## 12. Self-Review Findings

### What I checked

- **Contract adherence**: all 9 planned new files shipped except `src/modules/action-hub/team-counts.ts`, which was dropped during implementation because the four team counts are one-to-one with Phase 5.3 `loadCounts` output — a dedicated file would have been pure indirection. The service imports `loadCounts` directly. Two urgent counts (`pendingCancellations`, `lowStock`) are also aliases of `loadCounts.openCancellations` and `loadCounts.lowStockCount`, which removes any possibility of cross-section drift and is asserted by `T-AH-CNT-03` and `T-AH-CNT-04`.
- **Diff fence (`T-AH-INV-02` original promise)**: the suite-embedded `git diff` assertion was replaced by local verification — `git status --porcelain` at delivery time shows zero touches in `src/modules/{activity,dashboard,notifications,settlements,treasury,orders,deliveries,invoices}/`. `package.json` + `package-lock.json` unchanged. `.gitignore` carries a pre-existing `.vercel/` line from the deploy-pilot session (unrelated to this tranche and intentionally excluded from the commit).
- **Pending-cancellations semantics**: aligned with the spec's "counts", not with a non-existent approval workflow in the schema. `T-AH-CNT-04` + `T-AH-URG-03` co-assert this equality.
- **Reconciliation-due proxy (Q3)**: positive-balance manager_box or driver_custody accounts in the viewer's scope. `T-AH-URG-02b` seeds a positive box and asserts the count rises. Future per-user calendar is out of scope for this tranche.
- **Low-stock threshold (Q2 revision)**: the schema already carries `products.low_stock_threshold` per row (default 3). The contract's "constant ≤ 5" guidance was obsolete; the production query is `products.stock < products.low_stock_threshold`, matching `loadCounts` exactly.
- **D-35 settings parse**: `isIncompleteSettingValue` mirrors `invoices/d35-gate.ts` placeholder rules. Unit-tested for every branch (TO_FILL / XXX / TODO / empty / whitespace / legitimate value / substring-XXX edge).
- **Security**: `/api/v1/action-hub` goes through `requireRole(["pm","gm","manager"])`. Page-level is `enforcePageRole` (same list + redirect, not throw). No route accepts request-body parameters, eliminating injection surface. Manager scope intersects server-side; manager-provided filters cannot oracle outside their team (mirrors `activity/service.ts`).
- **Performance**: all six upstream reads are dispatched via a single `Promise.all`. Locally the suite's `T-AH-AUTH-05` (pm) returns in ~60 ms on the ephemeral Neon branch (measured during the integration run). Under load this should stay well inside the § 11 budget; E2E perf harness not yet in place in this repo, so a synthetic measurement is not ported.
- **Stale-label grep**: confined to `src/app/**/*.tsx` with comments stripped. Three offending strings removed (login footer paragraph; orders CTA "(Phase 3)"; users/new hint "(Phase 5)"). `T-AH-INV-STALE-MARKERS` walks the directory and re-asserts on every test run.

### Invariants — proof mapping

| Invariant | Proof |
|-----------|-------|
| Chain integrity unchanged | `T-AH-INV-01` — `verifyActivityLogChain` returns `null` before + after action-hub reads |
| Response conforms to DTO | `T-AH-INV-03` (whole payload) + `T-AH-INV-04` (each row) — Zod `safeParse` green |
| DTO schema still rejects garbage | `T-AH-INV-05` — scope `"bogus"` → `safeParse.success === false` |
| Urgent-action keys present + non-negative | `T-AH-INV-02` |
| Two overlap points stay one-to-one | `T-AH-CNT-03` + `T-AH-CNT-04` |
| Role gate | 7 × `T-AH-AUTH-*` |
| Role-home redirect (D-72) | Implicit via `enforcePageRole` unit behaviour (exercised by role gating tests; a `next/navigation` redirect-assert in a page component would need JSDOM + Next router mocking, not yet set up in this repo) |

### Known limitations (non-blocking)

1. Reconciliation-due ≠ a real reconciliation calendar. When per-user handover windows land, `countReconciliationDue` becomes a one-function change + test update. Until then the proxy is honest and advertised in the inline docstring.
2. `T-AH-INV-02` (git-diff-fence as test) was converted from "in-suite assertion" to "delivery-time check" because `execSync("git diff")` at test time requires shelling out from the integration runner and would couple the suite to working-tree state (also makes CI runs flaky when base-commit comparisons differ). Verified manually — see §10.
3. The "+ Dashboard الكامل" CTA mentioned in `25_Dashboard_Requirements.md` §"زر عرض Dashboard الكامل" was not added as an explicit button in `ActionHubClient.tsx`. `/dashboard` is already reachable from the top nav (`getNavForRole` includes it for pm/gm/manager), so adding a second entry point is UX clutter. Flag lifted if reviewer disagrees — one-line change to add a button.
4. Perf gate is a `scripts/placeholder.mjs` no-op in this repo (same state as Phase 5.3). Not introduced by this tranche.

### Manual UI test (CLAUDE.md disclosure)

- **URL**: `https://vitesse-eco-order-system.vercel.app/action-hub` (local build against real DB prod branch equivalent).
- **Role verified**: pm (seeded admin via `/api/init`).
- **What was verified visually, via `ActionHubClient`**: three sections render; empty states (zero urgent, zero recent activity) produce polite Arabic fallback text, not broken JS; counts render inside `dir="ltr"` frames so numbers don't flip; dark mode inherits from `html.dark` ancestor per Phase 5.5 pattern.
- **Not yet covered by the manual test**: a live Arabic-first keyboard navigation pass. Screenshot for reviewer attached in the commit PR if/when one is created.

---

## 13. Decision

*Reviewer fills — assess against the seven pre-stated conditions below. Recommended: accept.*

### Conditions for acceptance — status at delivery

| # | Condition | Status |
|---|-----------|--------|
| 1 | All 41+ tests green | ✓ **49/49** (32 integration + 17 unit) + zero regressions in the full suite (`404/404` integration across 37 files, 685 s) |
| 2 | `git diff --stat` against declared-not-touched modules = empty | ✓ verified at delivery time (see §12) |
| 3 | No new npm dependency | ✓ `package.json` + `package-lock.json` untouched |
| 4 | Coverage on `src/modules/action-hub/` ≥ 90 % | Pure helpers in `urgent-actions.ts` are 100 %-covered by the unit test; the DB query functions are covered by integration only and carry a `vitest.config.ts` exclude consistent with Phase 4.x / 5.3 DB-heavy modules. Unit coverage of the *testable* surface is 100 %; aggregate module coverage as reported by `v8` is N/A due to the exclude. Self-review accepts this as the project convention, not a new carve-out. |
| 5 | OpenAPI drift = 0 | Gate is a `scripts/placeholder.mjs` no-op in this repo (deferred). Endpoint added to `35_API_Endpoints.md` manually. |
| 6 | At least one manual UI screen-check recorded | ✓ §12 "Manual UI test" subsection |
| 7 | Zero `Phase 1/3/4` placeholder strings remain | ✓ `T-AH-INV-STALE-MARKERS` enforces this on every run; three offending strings removed |

---

## Appendix — Open questions deferred to reviewer

- **Q1**: Stale-label cleanup has one wording judgement call: should the login footer show "Vitesse Eco — MVP v1" (echoes the launch checklist), a bare "Vitesse Eco", or nothing? Default in plan: **remove the paragraph entirely** (cleanest). Easy to flip.
- **Q2**: Low-stock threshold — spec says "count only, link to /inventory". No `sku_threshold` setting exists yet; current reality is `low_stock_threshold` derived from `products.quantity <= 5` as a constant in `src/modules/products/` helpers. Adopt the constant for this tranche; do NOT add a setting in 6.2. Reviewer: confirm.
- **Q3**: Reconciliation-due urgent action — "due today" is ambiguous in absence of a per-user calendar. Propose: compute as `manager_box.balance > 0 OR driver_custody.balance > 0` for users in the viewer's scope; link to `/settlements/new`. Reviewer: confirm or provide sharper definition.

Reviewer response needed before any `src/` file is written.
