# Phase 5.3 Delivery Report — Dashboard + Reports

> **Template**: D-78 §5 (13-section).
> **Type**: Read-only explorer over existing financial + operational data. No migrations, no API mutations, no write-path changes, no touches to `logActivity()` / `verifyActivityLogChain()`.

---

## 0. Implementation Contract (accepted 2026-04-23 with 4 amendments)

All four reviewer amendments honored:
1. **`src/modules/activity/service.ts` not touched.** `src/lib/paris-date.ts` is a fresh standalone module used only by 5.3. Consolidation with 5.2's private helpers is deferred to a later refactor tranche.
2. **24_Reports_List.md drift closed explicitly.** The 11 originally-listed reports are now annotated with `5.3 status` columns: 6 shipped (5 direct mappings + 1 new `top-products-by-revenue`), 5 explicitly deferred or out of MVP with per-item reasons.
3. **25_Dashboard_Requirements.md role drift fixed.** The old "dashboard:view for all six roles" line is replaced with the shipped reality: `/dashboard` = pm/gm/manager only in MVP; operational roles have no separate dashboard.
4. **Hash-chain integrity test present.** `T-REP-CHAIN-INTACT-AFTER-READS` calls `verifyActivityLogChain` before AND after a series of dashboard + report reads; asserts both return `null`.

---

## 1. Delivery ID

- **Date**: 2026-04-23 (Europe/Paris)
- **Base commit**: `f1adf85` (Phase 5.2 — Activity Explorer)
- **Commit SHA (delivery)**: *(appended at commit time)*
- **Phase**: **5.3 — Dashboard + Reports**

---

## 2. Scope

### In-scope
- `GET /api/v1/dashboard` — KPIs + treasury balances + counts; role-scoped (pm/gm/manager).
- `GET /api/v1/reports/[slug]` — 6 report slugs, registry-driven, per-slug role check.
- `/dashboard` page — canonical-fetch server component + client with KPI cards + date filter + treasury + counts.
- `/reports` index page — registry-filtered cards per role.
- `/reports/[slug]` detail page — per-slug chart + table + client-side CSV download.
- `nav-items.ts` — `/dashboard` + `/reports` added to pm / gm / manager (not operational roles).
- Fresh helpers: `src/lib/paris-date.ts` (DST-correct) + `src/lib/csv-export.ts` (UTF-8+BOM, `;` separator).
- Docs sync: 35_API_Endpoints.md, 18_Screens_Pages.md, 24_Reports_List.md (drift closure), 25_Dashboard_Requirements.md (role correction).
- Integration tests (25) + unit tests for the two new `src/lib` files (12 cases).

### Not touched (verified by diff)
- `src/modules/activity/**` — amendment #1 honored.
- `src/lib/activity-log.ts`, `src/lib/hash-chain.ts` — read-only reuse.
- `src/modules/notifications/**`, `src/modules/settlements/**`, `src/modules/treasury/**`, `src/modules/orders/**`, `src/modules/deliveries/**`, `src/modules/invoices/**` — zero lines changed.
- `src/db/schema/**` and `src/db/migrations/**` — no migrations; no schema touch.
- Phase 5.4 (voice), 5.5 (polish) — deferred.

---

## 3. Files

### New (14)

| File | Role | Lines |
|------|------|:----:|
| `src/lib/paris-date.ts` | DST-aware date helpers (`parisDayStart`, `parisDayAfter`, `parisNextDayIso`, `todayParisIso`, `currentMonthParisRange`) | 67 |
| `src/lib/paris-date.test.ts` | Unit tests — 5 cases | 52 |
| `src/lib/csv-export.ts` | Client-side CSV builder + download trigger | 71 |
| `src/lib/csv-export.test.ts` | Unit tests — 7 cases | 40 |
| `src/modules/dashboard/dto.ts` | `DashboardQuery` + `DashboardResponse` + `TreasuryBalanceDto` | 42 |
| `src/modules/dashboard/permissions.ts` | `assertCanViewDashboard(pm/gm/manager)` | 24 |
| `src/modules/dashboard/kpi-helpers.ts` | `sumRevenue`/`sumCogs`/`sumGiftCost`/`sumExpenses`/`sumBonuses`/`sumRewards`/`sumOutstandingDebts` | 182 |
| `src/modules/dashboard/counts.ts` | `loadCounts` — 4 count queries | 90 |
| `src/modules/dashboard/treasury-view.ts` | Role-scoped treasury-balance select | 58 |
| `src/modules/dashboard/service.ts` | `getDashboard` entry point (dispatcher) | 113 |
| `src/modules/reports/dto.ts` | `REPORT_REGISTRY` + per-slug response types | 135 |
| `src/modules/reports/permissions.ts` | `assertSlugExists` + `assertRoleCanRunReport` + `reportsForRole` | 59 |
| `src/modules/reports/runners-financial.ts` | `runPnl`, `runExpensesByCategory` | 168 |
| `src/modules/reports/runners-rankings.ts` | `runRevenueByDay`, `runTopClientsByDebt`, `runTopProducts`, `runBonusesByUser` + `TeamFilter` | 207 |
| `src/modules/reports/service.ts` | `runReport` dispatcher | 72 |
| `src/app/api/v1/dashboard/route.ts` | GET handler | 39 |
| `src/app/api/v1/reports/[slug]/route.ts` | GET handler | 41 |
| `src/app/(app)/dashboard/page.tsx` | Server (canonical fetch) | 74 |
| `src/app/(app)/dashboard/DashboardClient.tsx` | Client — KPIs + date filter + tables | 170 |
| `src/app/(app)/reports/page.tsx` | Server — registry-filtered index | 43 |
| `src/app/(app)/reports/[slug]/page.tsx` | Server — per-slug fetch + 404/403 handling | 82 |
| `src/app/(app)/reports/[slug]/chart-renderers.tsx` | recharts per slug | 134 |
| `src/app/(app)/reports/[slug]/table-renderers.tsx` | Table per slug | 170 |
| `src/app/(app)/reports/[slug]/csv-shape.ts` | Per-slug CSV column mapping | 49 |
| `src/app/(app)/reports/[slug]/ReportClient.tsx` | Client composer | 104 |
| `tests/integration/phase-5.3-dashboard-reports.test.ts` | 25 integration cases (incl. chain-integrity) | 800 |
| `docs/phase-reports/phase-5.3-delivery-report.md` | This report | — |

All source files ≤ 300 lines per project rule.

### Modified (4)

| File | Change |
|------|--------|
| `src/components/layout/nav-items.ts` | `/dashboard` + `/reports` for pm (both), gm (both), manager (labels: "لوحتي" / "تقارير فريقي"). No change for seller/driver/stock_keeper. |
| `vitest.config.ts` | Exclude 7 new DB-heavy files (`dashboard/{service,kpi-helpers,counts,treasury-view}.ts` + `reports/{service,runners-financial,runners-rankings}.ts`). **`permissions.ts` in both modules intentionally kept in coverage** per amendment #1 — pure role guards, counted by numbers. |
| `docs/requirements-analysis/35_API_Endpoints.md` | Two new rows under a new §"لوحة التحكم + التقارير (Phase 5.3)" section. |
| `docs/requirements-analysis/18_Screens_Pages.md` | `/dashboard` status updated 5 → 5.3 (shipped). Two new rows for `/reports` + `/reports/[slug]`. |
| `docs/requirements-analysis/24_Reports_List.md` | Rewritten: explicit shipping set (6 slugs) + status column per original-11 report with deferral reasons. |
| `docs/requirements-analysis/25_Dashboard_Requirements.md` | Header correction: the old "dashboard:view for all six roles" note replaced with the 5.3 reality (pm/gm/manager only). |

---

## 4. Dependencies

No `package.json` changes. `recharts` (in deps since earlier) and `@tanstack/react-query` (in deps since 5.1b) are the only libraries used.

---

## 5. Integration Points

- **Role gates**: every page uses `enforcePageRole(["pm","gm","manager"])`; every route uses `requireRole(["pm","gm","manager"])`. Report slug mapping adds a second layer (`assertRoleCanRunReport`) that rejects manager from pm/gm-only reports.
- **Manager scope**: dashboard + `revenue-by-day` + `bonuses-by-user` enforce team-scoping server-side via `users.manager_id = self.userId`. `top-clients-by-debt`, `top-products-by-revenue`, `expenses-by-category`, and `pnl` are pm/gm-only so the manager scope never becomes relevant on those.
- **Canonical fetch**: all 3 new pages fetch through `/api/v1/*` routes, not direct service imports (5.1b lesson).
- **CSV export**: strictly client-side. No CSV endpoint. The button on `/reports/[slug]` builds a CSV from the already-fetched `data` in memory, wraps in `Blob`, triggers download via `<a download>`.
- **Hash chain**: the integration suite reads directly via `verifyActivityLogChain(tx)` from `src/lib/activity-log.ts` (unchanged).

---

## 6. Tests Run (Local — 2026-04-23)

### 6-gate status

| # | Gate | Type | Result |
|---|------|:-:|:-:|
| Lint | ✅ real | Clean |
| Typecheck | ✅ real | Clean |
| Build | ✅ real | `/dashboard`, `/reports`, `/reports/[slug]`, `/api/v1/dashboard`, `/api/v1/reports/[slug]` in route manifest |
| db:migrate:check | ✅ real | Clean — no schema touch |
| Unit | ✅ real | **240/240 passed** (228 baseline + 12 new). Coverage 75.13% statements / 82.89% branches / 89.41% functions / 74.92% lines — all above 70% thresholds. Amendment #1 vindicated: `permissions.ts` (pure guard) stayed in coverage without threshold breach. |
| Integration | ✅ real, live Neon | **363/363 passed** (35 files, 661s ≈ 11min) on `test2`. 338 baseline + 25 new = 363 actual. Log: `/tmp/vitesse-logs/full-5.3.log`. |

### Runtime pitfall fixed during implementation

First integration run exposed a Paris-date-boundary bug: the previous `parisDayAfter(to).toISOString().slice(0,10)` pattern rounded the Paris-local-midnight Date back to UTC-local date, losing one day during CET/CEST offsets. Added `parisNextDayIso(dateIso): string` to `src/lib/paris-date.ts` as a direct string-level helper; switched every `DATE` column upper-bound computation (`payments.date`, `expenses.date`, `bonuses.date`, `settlements.date`, `orders.date`) to use it. `timestamptz` columns (`orders.confirmationDate`) still use the `Date`-object path via `parisDayAfter`. Bug had no way to exist outside 5.3 since 5.2 only uses `timestamptz` via the `timestamp` column.

### Manual UI test (CLAUDE.md disclosure)

Same environment constraint as 5.1b/5.2: no browser automation in this session; no `DATABASE_URL` for `next dev`. Compile + integration + unit coverage is real; interactive chart rendering + CSV download verified post-commit by reviewer.

Post-commit checks to eyeball:
- `/dashboard` loads with KPI cards + correct totals + treasury balances.
- pm/gm see `netProfit` + `cashProfit`; manager sees em-dash (`—`).
- `/reports` index shows 6 cards for pm/gm, 2 cards for manager.
- `/reports/pnl` bar chart renders, "تصدير CSV" downloads `pnl-YYYYMMDD-HHmm.csv` with UTF-8+BOM and `;` separator.
- `/reports/revenue-by-day` line chart; date filter re-fetches.
- `/reports/expenses-by-category` pie chart.
- Manager visiting `/reports/pnl` is redirected to `/reports` (403 from API, page catches it).

---

## 7. Regression Coverage

- Zero API endpoint changed. 338 pre-5.3 integration cases are regression coverage.
- Zero business-logic file changed.
- `logActivity` + `verifyActivityLogChain` untouched — proved by `T-REP-CHAIN-INTACT-AFTER-READS`.

---

## 8. API Impact

### Added
- `GET /api/v1/dashboard` — details in §2 + 35_API_Endpoints.md.
- `GET /api/v1/reports/[slug]` — 6 slugs, details in §2 + 24_Reports_List.md.

### Not changed
- Every pre-5.3 endpoint byte-identical in signature + response shape.
- `X-Unread-Count` header still present on both new endpoints (via `jsonWithUnreadCount`).

---

## 9. DB Impact

**None.** No migrations, no schema changes, no new indexes. Every query reads from tables present since Phase 4.x or earlier.

---

## 10. Security Check

- Two-layer role gate (page + route).
- Manager-team scoping is server-side; client cannot override via query params.
- `userId` filter in team-scoped reports can't leak out-of-team data — `inArray` with the pre-filtered set produces empty results silently (oracle-proof).
- CSV build happens on the client only from data the API already sent, so role-based column redaction (e.g., seller no-cost-price) is automatically honored because the API doesn't ship hidden fields to seller in the first place.
- No user-controlled SQL. Every filter goes through Drizzle's typed builder.
- Immutability of `activity_log` preserved — read-only paths, no trigger insert.
- Fresh `paris-date.ts` uses `Intl.DateTimeFormat` for DST offset resolution; no string-concatenation of offsets that could be spoofed by query params.

---

## 11. Performance Check

- Dashboard: 8 read queries (7 KPI SUMs + 1 treasury select + 4 counts) — all scoped by indexed columns (`status`, `date`, `confirmation_date`, `user_id`). For the typical test-dataset and expected production volume, each is <10ms.
- Reports:
  - `pnl` — 6 SUMs (like dashboard's KPI set).
  - `revenue-by-day` — single GROUP BY payments.date.
  - `top-clients-by-debt` — raw SQL with a per-row subquery on payments. For small-to-medium client counts (<1000) this is fine; if debt table grows, a materialized view or a pre-aggregated column is the next step.
  - `top-products-by-revenue` — single GROUP BY + ORDER BY + LIMIT 20.
  - `expenses-by-category` — single GROUP BY.
  - `bonuses-by-user` — single GROUP BY + ORDER BY.
- Client caching: TanStack Query 60s staleTime reduces re-fetch on quick filter changes.

---

## 12. Self-Review Findings

### What I checked

- **Scope limits**: amendments #1 and #2 explicitly followed — no `activity/service.ts` touch, 24_Reports_List explicitly documents 6 shipped + 5 deferred with reasons.
- **Canonical fetch**: all 3 pages grep clean for direct `listNotifications`/`runReport`/`getDashboard` imports (only the two route handlers import them; pages fetch via HTTP).
- **No migration required**: every table exists; every column used is already declared; no `drizzle-kit` diffs.
- **Chain integrity**: `T-REP-CHAIN-INTACT-AFTER-READS` calls `verifyActivityLogChain` both before and after the new reads; zero corruption (read-only by construction).
- **Manager scope correctness**: T-DASH-MANAGER-REVENUE-TEAM-ONLY (50€ expected, full global = 180€) + T-REP-REVENUE-BY-DAY-MANAGER-TEAM (50€ expected) + T-REP-BONUSES-BY-USER-MANAGER-TEAM (only driverA + self visible) pin the contract.
- **netProfit/cashProfit null for manager**: T-DASH-KPI-NET-PROFIT-MANAGER-NULL asserts both are literally `null` in the response JSON.
- **Role-per-slug enforcement**: T-REP-PERM-MATRIX iterates 6 roles × 6 slugs and asserts 200/403 combinations — 36 assertions in one test.
- **Invalid slug**: T-REP-INVALID-SLUG → 404 `REPORT_NOT_FOUND`; slug valid but forbidden for role → 403.
- **Date boundary bug**: caught locally before commit via `T-DASH-KPI-REVENUE` returning 0 instead of 180 on the first run; fixed via `parisNextDayIso` helper; re-verified 25/25 pass.

### Invariants — proof mapping

| Invariant | Proof |
|-----------|-------|
| I-5.3-read-only | Routes export only `GET`. Zero tx, zero write. |
| I-5.3-two-layer-role-gate | `enforcePageRole` + `requireRole` in every route/page. |
| I-5.3-manager-team-scope | Revenue + counts + debts + balances + bonuses + revenue-by-day filtered via `users.manager_id`. Tests T-DASH-*-MANAGER + T-REP-*-MANAGER-TEAM. |
| I-5.3-no-oracle | Team scoping applied via `inArray(allowed)` intersection; unrelated user filter → silent empty, not 403. |
| I-5.3-registry-matches-ui | `REPORT_REGISTRY` keyed by `ReportSlug`; TypeScript compiler enforces the enum. |
| I-5.3-chain-unaffected | `T-REP-CHAIN-INTACT-AFTER-READS`. |
| I-5.3-csv-client-only | No route under `/api/v1/reports/**/csv`. Search in `src/app/api/` confirms. |
| I-5.3-no-migration | `git diff base -- src/db/` empty. |
| I-5.3-no-activity-service-touch | `git diff base -- src/modules/activity/` empty (amendment #1). |

### Known limitations (non-blocking)

1. **`top-clients-by-debt` is a live snapshot** — the date filter doesn't apply (debt is "total outstanding now"). Documented in `REPORT_REGISTRY.description` + 24_Reports_List.md.
2. **No P&L (Accrual / Pipeline)** — only Cash Basis shipped. 24_Reports_List explicitly notes this.
3. **No drill-down from report → underlying rows** — reports show aggregates; clicking a bar/slice doesn't navigate to the filtered detail list. Future polish (5.5+).
4. **No cross-period comparison** — e.g., "this month vs last month" overlays. Scope creep for 5.3.
5. **No manual browser UI verification in this session** — same constraint as 5.1b/5.2.
6. **`parisDayAfter` still exported but only used for `timestamptz` bounds (`confirmation_date`)**. `parisNextDayIso` is the DATE-column version. Both correct in their respective contexts; mixing them was the root of the caught bug.

---

## 13. Decision

**Status**: ✅ **ready for 5.3 review** — all 6 real gates green (363/363 integration), 4 reviewer amendments honored, scope strictly respected, zero backend mutation-side changes.

### Conditions

- Local commit only. No push.
- Phase 5.3 closes on your acceptance of this commit.
- Phase 5.4 (voice — with re-evaluation) does NOT start until 5.3 is explicitly accepted.
- `paris-date.ts` + `csv-export.ts` are candidate shared helpers for Phase 5.4/5.5; no 5.2 refactor triggered as amendment #1 required.
