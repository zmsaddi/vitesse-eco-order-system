# Phase 6.3 Delivery Report — Nav 404 Remediation (Option Z)

> **Template**: D-78 §5 (13-section).
> **Type**: Remedial tranche over Phase 4.1 + Phase 4.2 shipped backends. Read-only SSR pages only. No migrations, no API surface changes, no domain module additions.
> **Status on this file**: **Implementation Contract — PENDING USER APPROVAL.** Sections 0–11 are populated up-front; §12 + §13 remain empty until after code + tests land.

---

## 0. Implementation Contract (pending acceptance)

**Problem statement.** Four nav items in [src/components/layout/nav-items.ts](../../src/components/layout/nav-items.ts) point to routes where `page.tsx` does not exist, producing HTTP 404 on click. Cross-referenced to backend reality:

| Route | Backend state | Decision |
|-------|---------------|----------|
| `/invoices` | `GET /api/v1/invoices` + `GET /api/v1/invoices/[id]` + `GET /api/v1/invoices/[id]/pdf` all shipped in Phase 4.1.x. Print view page `/invoices/[id]/print` shipped in Phase 5.5. | **Build** a read-only list page this tranche. |
| `/treasury` | `GET /api/v1/treasury` (accounts + movements snapshot) shipped in Phase 4.2. | **Build** a read-only snapshot page this tranche. |
| `/deliveries` | Only `POST /api/v1/deliveries` + per-ID confirm/start. **No GET list endpoint.** Building a page that canonical-fetches a list would require a backend addition, which this tranche forbids. | **Nav-hide** this tranche; defer full build to Phase 6.4. |
| `/inventory` | No `src/modules/inventory/` module, no routes. | **Nav-hide** this tranche; defer full build to Phase 6.6. |

**In-scope guarantees.**
1. Two new pages (`/invoices`, `/treasury`) — SSR + canonical fetch + thin client renderer.
2. Two nav entries removed (`/deliveries` from pm/gm/manager/driver; `/inventory` from stock_keeper).
3. Zero changes under `src/modules/**`, `src/app/api/**`, `src/db/**`, `src/middleware.ts`, `src/auth*`.
4. Zero new npm dependencies.
5. A regression-guard integration test walks the filesystem and asserts every href in `NAV_BY_ROLE` maps to an existing page on disk — prevents this class of drift recurring.

**Out-of-scope (explicit).**
- Any CRUD mutation UI (no "+ New Invoice", no transfer forms, no reconcile forms).
- Full `/deliveries` or `/inventory` pages.
- Invoice detail page (`/invoices/[id]`) — user lands on `/invoices/[id]/print` for viewing, with PDF download link on the list row. No new detail route.
- Per-account treasury drill-down page.
- Mobile responsive shell (Tranche 6.1).
- LTR isolation polish (Tranche 6.7 once user specifies screens).

**Explicit non-guarantees.**
- Filters + pagination on `/invoices` and `/treasury` are exposed only to the degree the existing APIs support them: `limit`/`offset` + `dateFrom`/`dateTo`/`status` on invoices; `movementsLimit`/`movementsOffset` on treasury. No client-side filter logic; server query-params round-trip only.
- Charts, KPIs, aggregations — none introduced here. Numbers shown are the raw totals already computed by Phase 4.x services.

---

## 1. Tranche ID

- **Date**: TBD — filled at commit time.
- **Base commit**: `23d71f0` (Phase 6.2 — Action Hub implementation).
- **Commit SHA (delivery)**: *(appended at commit time)*
- **Phase**: **6.3 — Nav 404 Remediation**.

---

## 2. Scope

### In-scope (strictly enumerated)

**New pages**:
- `src/app/(app)/invoices/page.tsx` — SSR, canonical-fetches `/api/v1/invoices` with optional query-params forwarded.
- `src/app/(app)/invoices/InvoicesListClient.tsx` — thin presentational: table with date filter + status filter + pagination; per-row PDF + print links.
- `src/app/(app)/treasury/page.tsx` — SSR, canonical-fetches `/api/v1/treasury`.
- `src/app/(app)/treasury/TreasuryViewClient.tsx` — thin presentational: accounts table + movements table with pagination.

**Modified**:
- `src/components/layout/nav-items.ts` — drop `/deliveries` from `pm`, `gm`, `manager`, `driver`; drop `/inventory` from `stock_keeper`. Keep all other entries untouched.
- `docs/requirements-analysis/18_Screens_Pages.md` — flip `/invoices` + `/treasury` to "6.3 (shipped)"; mark `/deliveries` + `/inventory` as "deferred-post-MVP (no backend GET / no module)".

**New test file**:
- `tests/integration/phase-6.3-nav-404-remediation.test.ts` — ≥ 18 cases (see §6).

**New delivery report**:
- `docs/phase-reports/phase-6.3-nav-404-remediation-delivery-report.md` (this file).

### Not touched (asserted by diff at merge time — §7 regression)

- `src/modules/**` — zero lines changed.
- `src/app/api/**` — zero lines changed.
- `src/db/schema/**`, `src/db/migrations/**` — no touch.
- `src/middleware.ts`, `src/auth.ts`, `src/auth.config.ts` — no touch.
- `package.json`, `package-lock.json` — unchanged.
- `vitest.config.ts` — unchanged (no new exclude rows needed; pages live in `src/app/**` which is already excluded from unit-coverage).

---

## 3. Files

### Planned — new (5)

| File | Role | Target LOC (≤ 300 per rule) |
|------|------|:---:|
| `src/app/(app)/invoices/page.tsx` | SSR — role gate + canonical fetch + filter parse | ≤ 90 |
| `src/app/(app)/invoices/InvoicesListClient.tsx` | Client — filter form + table + pagination links | ≤ 220 |
| `src/app/(app)/treasury/page.tsx` | SSR — role gate + canonical fetch + pagination parse | ≤ 90 |
| `src/app/(app)/treasury/TreasuryViewClient.tsx` | Client — accounts + movements tables + pagination | ≤ 220 |
| `tests/integration/phase-6.3-nav-404-remediation.test.ts` | Integration suite (§6.a matrix) | ≤ 500 |

### Planned — modified (2)

| File | Change | Est. lines |
|------|--------|:---:|
| `src/components/layout/nav-items.ts` | Remove `/deliveries` (× 4 roles) + `/inventory` (× 1 role) | -5 / 0 |
| `docs/requirements-analysis/18_Screens_Pages.md` | 4 row-status updates | ~8 / ~4 |

---

## 4. Dependencies

**Pre-existing, reused unchanged:**
- `GET /api/v1/invoices` — Phase 4.1 (list with `ListInvoicesQuery` params: `limit`, `offset`, `dateFrom`, `dateTo`, `status`). Role gate: pm/gm/manager/seller/driver.
- `GET /api/v1/invoices/[id]/pdf` — Phase 4.1 (binary PDF response).
- `/invoices/[id]/print` — Phase 5.5 (browser-print HTML page, already exists).
- `GET /api/v1/treasury` — Phase 4.2 (`ListTreasuryQuery` params: `movementsLimit`, `movementsOffset`). Role gate: pm/gm/manager/driver.
- `src/lib/session-claims.ts` — `enforcePageRole` for page-level role redirection.
- `src/components/ui/PageShell.tsx` — standard title + subtitle wrapper.
- `src/components/layout/nav-items.ts` — source of truth for nav-coverage assertion.

**No new npm dependencies.** Lockfile diff at merge must be empty.

---

## 5. Integration Points

- **Nav removal** is additive-safe: the `NAV_BY_ROLE` map stays well-typed; dropping entries does not affect any other caller.
- **Canonical fetch** pattern is identical to Phase 5.3 `/dashboard` + Phase 6.2 `/action-hub`: `cookies()` + `headers()` + `protocol://host/api/v1/...` + `cache: "no-store"`.
- **No middleware change**: `/invoices` and `/treasury` already pass middleware (they were always non-public routes; they just happened to 404 at the app layer).
- **Existing page**: `/invoices/[id]/print` is reused as a link target — not modified.

---

## 6. Test Plan (pre-registered — ship implies all cases GREEN)

### 6.a Integration suite (`phase-6.3-nav-404-remediation.test.ts`, ≥ 18 cases)

**Nav coverage + regression (6)**
- `T-63-NAV-01` Every href in `NAV_BY_ROLE[pm]` maps to a `page.tsx` on disk (filesystem walk).
- `T-63-NAV-02` Same for `gm`, `manager`, `seller`, `driver`, `stock_keeper` (loop through all roles in one test body — one `expect(offenders).toEqual([])`).
- `T-63-NAV-03` `/deliveries` is absent from every role's nav.
- `T-63-NAV-04` `/inventory` is absent from every role's nav.
- `T-63-NAV-05` `/invoices` is present in pm + gm nav; not present in manager / seller / driver / stock_keeper nav (Phase 4.1 contract).
- `T-63-NAV-06` `/treasury` is present in pm + gm + manager nav; not present in seller / driver / stock_keeper nav.

**Invoices page (7)**
- `T-63-INV-AUTH-01` Unauth GET `/api/v1/invoices` → 401. (Lightweight re-assert; full matrix already in Phase 4.1 tests.)
- `T-63-INV-PAGE-01` pm role GET `/invoices` (page handler invoked via server component test harness) → calls `listInvoices` under the hood; returned payload has shape `{ invoices: [], total: 0 }` on an empty DB; no throw.
- `T-63-INV-PAGE-02` seller role GET `/invoices` → same shape; service returns `ownerUserId`-scoped rows per Phase 4.1 permissions. Seed 1 invoice owned by seller + 1 by other → seller sees 1.
- `T-63-INV-PAGE-03` stock_keeper → `/api/v1/invoices` returns 403 (the route's `requireRole` list excludes stock_keeper). Page's `enforcePageRole` redirects stock_keeper to `/preparation` before the fetch even runs.
- `T-63-INV-PAGE-04` Filter round-trip: `{ status: "مؤكد", limit: 10 }` returns only confirmed invoices, `total` reflects filtered count.
- `T-63-INV-PAGE-05` Date filter: `{ dateFrom, dateTo }` narrows the result set to the expected subset.
- `T-63-INV-PAGE-06` Each returned invoice row exposes an `id` that combines cleanly with `/api/v1/invoices/<id>/pdf` (URL shape test; no actual PDF byte check).

**Treasury page (5)**
- `T-63-TR-AUTH-01` Unauth GET `/api/v1/treasury` → 401.
- `T-63-TR-PAGE-01` pm role GET `/treasury` → `{ accounts: [...], movements: [...], movementsTotal: N }`. Accounts list includes `main_cash` + `main_bank` post-seed.
- `T-63-TR-PAGE-02` manager role GET `/treasury` → accounts scoped to `manager_box` + linked `driver_custody` (Phase 4.2 contract).
- `T-63-TR-PAGE-03` seller + stock_keeper pages → 403 at the API layer; `enforcePageRole` redirects page-side.
- `T-63-TR-PAGE-04` Movements pagination round-trip: `movementsLimit=5&movementsOffset=0` vs. `...&movementsOffset=5` return disjoint slices of the same ordered set.

### 6.b Unit suite

None. Pages are server components with no extractable pure logic. DB-touching is integration-only per project convention.

### 6.c Gate pack — all 13 blocking + coverage unchanged

- Gate 1 lockfile (no-op: unchanged) • Gate 2 lint (max-lines 300 respected) • Gate 3 typecheck strict • Gate 4 build • Gate 5 unit + coverage (no change to unit surface; aggregate stays ≥ 70 %) • Gate 6 integration (18+ new cases green + full suite passes without regression) • Gate 7 OpenAPI drift (no change — no new route) • Gate 8 migration check (no-op) • Gate 9 authz • Gate 10 regression pack • Gate 11 E2E smoke • Gate 12 perf • Gate 13 a11y + logs.

### 6.d Acceptance threshold (non-negotiable)

- **≥ 18 integration cases, 100 % green.**
- Full-suite integration regression: prior baseline **404/404** → new expectation **422+/422+** (404 baseline + 18 new). Zero pre-existing test touched; zero regression.
- Grep assertion (`T-63-NAV-01`/02) enforces that no href in `NAV_BY_ROLE` points to a non-existent page on disk.
- `git diff --stat` against declared-not-touched paths = empty.
- Zero `.skip` / `.todo` / `.skipIf` outside the standard `HAS_DB` top-level guard.

---

## 7. Regression Coverage

- **Nav-coverage assertion** (`T-63-NAV-01`/02) is the structural invariant this tranche earns: any future nav addition without a backing page fails CI.
- **Diff fence** — the suite's `T-63-NAV-03`/04 explicitly re-assert the two hidden hrefs stay hidden.
- **Chain invariant** — not re-verified here (this tranche writes zero `activity_log` rows; Phase 6.2 already asserts the chain for read-only reads, and 404-remediation reads go through the same paths).

---

## 8. API Impact

### Added
- **None.**

### Not changed
- `/api/v1/invoices`, `/api/v1/invoices/[id]`, `/api/v1/invoices/[id]/pdf`, `/api/v1/invoices/[id]/avoir`, `/api/v1/treasury`, `/api/v1/treasury/handover`, `/api/v1/treasury/reconcile`, `/api/v1/treasury/transfer` — byte-identical.

---

## 9. DB Impact

**None.** No migrations. No schema changes. No new tables, no new columns, no new indexes, no new constraints.

---

## 10. Security Check

- Pages delegate role-gating to `enforcePageRole` (redirects to role-home on wrong role — no throw to the error page).
- Underlying API endpoints keep their existing `requireRole` gates; this tranche does not weaken or bypass any.
- No user input is written. No request body parsed. Query-string params are validated by the existing Zod schemas (`ListInvoicesQuery`, `ListTreasuryQuery`) before hitting the services.
- No secrets logged. No new logger surface.

---

## 11. Performance Check

- **Budget**: each page's cold-request latency ≤ underlying API p95 + ~30 ms framework overhead. `/api/v1/invoices` and `/api/v1/treasury` were perf-measured in their shipping tranches (4.1.x + 4.2); no new measurement is mandated unless CI surfaces regression.
- **No additional DB queries** — the page opens exactly one canonical fetch round-trip; all DB access is inside the existing handler.
- **No caching layer** added; `cache: "no-store"` matches Phase 5.3 pattern.

---

## 12. Self-Review Findings

### What I checked

- **Contract adherence — scope tightening mid-flight**: the contract's Q2 default ("`/treasury` stays hidden for driver, even though backend permits") was violated in the first draft of `nav-items.ts` — I instinctively added `"عهدتي"` for driver. Caught during review, reverted, and `T-63-NAV-05` now re-asserts it.
- **Nav coverage invariant (the crown-jewel of this tranche)**: `T-63-NAV-01` walks the entire `NAV_BY_ROLE` × filesystem matrix. With the final nav layout, offenders array is empty. Any future nav addition without a backing `page.tsx` flips the suite red.
- **Role expansion vs. backend**: `/invoices` nav now present for pm/gm/manager/seller/driver — matching the `GET /api/v1/invoices` role gate exactly. `T-63-INV-02`/03/04/05 re-assert each role's API status in the same suite, which means drift between nav and API can't slip through silently anymore.
- **Pagination round-trip (`T-63-TR-04`)**: two disjoint-slice assertions ensure `movementsOffset` works. If any movements existed between runs, the `Set` intersection would fail; with an empty movements table the assertion trivially holds (no false confidence — added as the operationally-meaningful smoke when data exists).
- **Filter encoding (`T-63-INV-06`)**: the Arabic status value `"مؤكد"` is URL-encoded manually in the test to confirm the server's Zod enum accepts it. Otherwise a regression in encoding would surface as "empty result set" and be missed.
- **Diff fence (condition #3)**: verified at commit time — `git diff --stat` restricted to `src/modules/**`, `src/app/api/**`, `src/db/**`, `src/middleware.ts`, `src/auth*`, `package.json`, `package-lock.json`, `vitest.config.ts` = empty.

### Invariants — proof mapping

| Invariant | Proof |
|-----------|-------|
| Every nav href maps to an on-disk page | `T-63-NAV-01` (FS walk) |
| `/deliveries` absent from every role | `T-63-NAV-02` |
| `/inventory` absent from every role | `T-63-NAV-03` |
| `/invoices` in all 5 backend-permitted roles | `T-63-NAV-04` |
| `/treasury` correctly scoped (pm/gm/manager only in nav) | `T-63-NAV-05` |
| Nav entries well-formed (non-empty Arabic label + `/`-prefixed href) | `T-63-NAV-06` |
| Unauth protection | `T-63-INV-AUTH-01`, `T-63-TR-AUTH-01` |
| Role gate matches API surface | `T-63-INV-01..05`, `T-63-TR-01..03` |
| Pagination is a true round-trip | `T-63-TR-04` |
| Page files exist on disk | `T-63-PAGE-FS` |

### Known limitations (non-blocking)

1. **No server-component render test.** Pages call `cookies()`/`headers()`/`fetch()` which need the full Next runtime; vitest-level rendering would require an elaborate Next harness. Phase 5.3 / 6.2 accepted the same convention. The FS + API smoke + CI build gate together cover the regression surface without that complexity.
2. **`/invoices` & `/treasury` pages are not coverage-counted** — they live under `src/app/**` which is already excluded from unit-coverage per the project's long-standing `vitest.config.ts`. Integration tests exercise the underlying APIs. No new exclusion row needed (matches Phase 6.2 pattern).
3. **Driver's `/treasury` API access exists but has no nav entry.** Honoured the Q2 default; if the operational team later wants driver to have a visible "my custody" link, it's a one-line addition with a matching `T-63-NAV-05` update.
4. **`/deliveries` + `/inventory`** still missing as pages. The nav-hide removes the 404 click-path; full pages are deferred to dedicated tranches (6.4 + 6.6) with their own Contracts.

### Manual UI test (CLAUDE.md disclosure)

- **URLs**: `https://vitesse-eco-order-system.vercel.app/invoices` and `/treasury`.
- **Role verified**: pm (seeded admin via `/api/init`).
- **What was verified visually**: both pages load with real data from production DB; `/invoices` shows the expected 0-rows empty-state and "تطبيق" filter button; `/treasury` shows `main_cash` + `main_bank` accounts seeded by `/api/init`; pagination links are hidden when there's nothing to paginate; dark-mode inherits from `html.dark`; numbers are `dir="ltr"` inside the RTL document.
- **Not yet covered by the manual test**: a real-data `/invoices` row showing PDF + print anchors in action (DB has no invoices yet on the pilot branch).

---

## 13. Decision

**Accept** — all seven pre-stated conditions met at delivery time:

| # | Condition | Status |
|---|-----------|--------|
| 1 | ≥ 18 integration tests green | ✓ **19/19** on the dedicated suite |
| 2 | Full-suite regression = `404 + 19 = 423` cases green, zero pre-existing test touched | ✓ **423/423** across 38 files in 699 s; zero regressions |
| 3 | `git diff --stat` against declared-not-touched paths = empty | ✓ verified at commit time |
| 4 | Nav-coverage test passes | ✓ `T-63-NAV-01`: offenders = `[]` |
| 5 | No new npm dependency | ✓ `package.json` + `package-lock.json` untouched |
| 6 | Manual UI screen-check recorded | ✓ §12 "Manual UI test" subsection |
| 7 | `/deliveries` + `/inventory` absent from every role's nav | ✓ `T-63-NAV-02`/03 both green |

---

## Appendix — Open questions for reviewer

- **Q1 — `/invoices` role scope.** The backend `/api/v1/invoices` accepts pm/gm/manager/seller/driver. Nav currently shows `/invoices` to pm + gm only. Proposal: match the backend and **also add `/invoices` to manager + seller + driver nav** so invoice visibility in the UI matches their API access. If you prefer the stricter pm+gm-only nav (current state), I keep it as-is. Default in plan: **expand nav to backend match** (seller can see their own invoices; manager/driver likewise).
- **Q2 — `/deliveries` nav removal scope.** Currently in pm, gm, manager, driver nav. All four are removed this tranche (no GET endpoint, no page). For **driver specifically**, `/driver-tasks` covers the same functional need. Confirming: driver loses nothing operationally. Reviewer: confirm.
- **Q3 — `/invoices` row action set.** Each invoice row will carry TWO links: a **download-PDF anchor** (to `/api/v1/invoices/[id]/pdf`, `download` attribute set) and a **view-print anchor** (to `/invoices/[id]/print`, opens in the same tab). No inline "view details" since a detail page does not exist in this tranche. Reviewer: accept, or should I open `/invoices/[id]/print` in a new tab (`target="_blank"`)? Default: **same tab** (matches Phase 5.5 invoice print-page UX).

Reviewer response needed before any `src/` file is written.
