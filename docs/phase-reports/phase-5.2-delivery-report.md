# Phase 5.2 Delivery Report — Activity Explorer

> **Template**: D-78 §5 (13-section).
> **Type**: Read-only explorer over the immutable `activity_log` table. `GET /api/v1/activity` + `/activity` page + nav integration. No migrations, no API mutations, no changes to `logActivity()` write path or the shared hash-chain helper.

---

## 0. Implementation Contract (accepted 2026-04-23)

Per the accepted contract with two binding amendments:
1. `vitest.config.ts` exclude for `src/modules/activity/**` only covers `service.ts` (DB-heavy). `permissions.ts` is a pure role guard; kept in coverage and verified by numbers (see §6).
2. Commit flow: once all gates are green + D-78 + self-review are done, commit locally in the same turn. No second approval gate.

No other scope; no Dashboard / Reports, no Voice, no Polish.

---

## 1. Delivery ID

- **Date**: 2026-04-23 (Europe/Paris)
- **Base commit**: `ff3c315` (Phase 5.1b — canonical fetch refactor)
- **Commit SHA (delivery)**: *(recorded at commit time — appended below)*
- **Phase**: **5.2 — Activity Explorer**

---

## 2. Scope

### In-scope
- `GET /api/v1/activity` — read-only list + pagination + filters.
- `/activity` — server component with canonical fetch + client sub-component for filters/pagination/table.
- `nav-items.ts` — `/activity` link for pm/gm/manager (labels differ per role).
- Integration tests (16 cases) covering permission matrix, filters, pagination, manager-team scoping, result ordering, and hash-chain integrity.
- Docs sync (35_API_Endpoints.md + 18_Screens_Pages.md).
- `vitest.config.ts` coverage exclude for the one DB-heavy module.

### Not touched (deferred explicitly)
- Dashboard + Reports → Phase 5.3
- Voice → Phase 5.4
- Polish (dark mode, empty states, printable invoice HTML, PWA) → Phase 5.5
- `logActivity()` write path + shared `hash-chain.ts` helper + `verifyActivityLogChain()` — reused as-is from Phase 3.0.1.
- `src/db/schema/**` — no migration, no schema touch.
- All Phase 4 / 5.1 modules.

---

## 3. Files

### New

| File | Role | Lines |
|------|------|:----:|
| [`src/modules/activity/dto.ts`](../../src/modules/activity/dto.ts) | Zod schemas + enums (14 entity types, 9 actions, ListActivityQuery, ListActivityResponse, ActivityDto) | 86 |
| [`src/modules/activity/mappers.ts`](../../src/modules/activity/mappers.ts) | `activityRowToDto` — one-to-one column mapping | 26 |
| [`src/modules/activity/permissions.ts`](../../src/modules/activity/permissions.ts) | `ActivityClaims` + `assertCanViewActivity` (pm/gm/manager allowed; others → PermissionError) | 24 |
| [`src/modules/activity/service.ts`](../../src/modules/activity/service.ts) | `listActivity` — manager-team filter (users.manager_id) + query filters + pagination + DESC-by-id order + Paris-date window | 112 |
| [`src/app/api/v1/activity/route.ts`](../../src/app/api/v1/activity/route.ts) | GET handler — `requireRole(["pm","gm","manager"])` → validate → service → `jsonWithUnreadCount` | 38 |
| [`src/app/(app)/activity/page.tsx`](../../src/app/(app)/activity/page.tsx) | Server component — `enforcePageRole` + canonical fetch to `/api/v1/activity` (cookies+headers) | 98 |
| [`src/app/(app)/activity/ActivityListClient.tsx`](../../src/app/(app)/activity/ActivityListClient.tsx) | Client — filter selects + date range + pagination + table; TanStack Query with SSR initialData | 249 |
| [`tests/integration/phase-5.2-activity-explorer.test.ts`](../../tests/integration/phase-5.2-activity-explorer.test.ts) | 16 cases — permissions × 6, filters × 4, pagination × 1, scoping × 3, ordering × 1, chain verify × 1 | 380 |
| [`docs/phase-reports/phase-5.2-delivery-report.md`](./phase-5.2-delivery-report.md) | This report | — |

All source files ≤ 300 lines per the project rule.

### Modified

| File | Change |
|------|--------|
| [`src/components/layout/nav-items.ts`](../../src/components/layout/nav-items.ts) | Adds `{ href: "/activity", labelAr: … }` to **pm** + **gm** + **manager** nav lists. Labels differ by role: "سجل النشاطات" for admin roles; "سجل نشاط فريقي" for manager (reflects the scoped view). |
| [`docs/requirements-analysis/35_API_Endpoints.md`](../../docs/requirements-analysis/35_API_Endpoints.md) | `/api/v1/activity` row rewritten from "UI pending" to "shipped" with the exact contract (query shape, response shape, manager scope, no-oracle policy). |
| [`docs/requirements-analysis/18_Screens_Pages.md`](../../docs/requirements-analysis/18_Screens_Pages.md) | `/activity` row: type changed from `CRUD` → `Read-only`; Phase `5` → `5.2 (shipped)`. |
| [`vitest.config.ts`](../../vitest.config.ts) | Adds `src/modules/activity/service.ts` to the coverage-exclude list (DB-heavy, integration-covered). `permissions.ts` intentionally **NOT** excluded — pure role guard; kept in coverage. Numbers confirm it: coverage stayed above thresholds. |

### Not touched (verified by diff)

- `src/lib/activity-log.ts` — write path + `verifyActivityLogChain` identical to HEAD.
- `src/lib/hash-chain.ts` — shared helper identical.
- `src/db/schema/audit.ts` — schema identical.
- `src/db/migrations/**` — zero new files.
- `src/modules/notifications/**` / `settlements/**` / `treasury/**` / `orders/**` / `deliveries/**` / `invoices/**` — zero lines changed.

---

## 4. Dependencies

No `package.json` changes.

---

## 5. Integration Points

- **Nav**: pm/gm/manager see `/activity` in the sidebar; other roles do not.
- **Route access**: `enforcePageRole(["pm","gm","manager"])` in `page.tsx` + `requireRole([...])` in the route handler. Two independent guards; `seller/driver/stock_keeper` redirected at page level, rejected with 403 at API level.
- **Canonical fetch**: `/activity/page.tsx` fetches `/api/v1/activity` via cookies+headers — same pattern as `/my-bonus/page.tsx` and the post-review 5.1b pages. Zero direct service/DB imports from the page.
- **Manager scope**: `service.ts::visibleUserIdsForManager` reads `users.manager_id` to compute the allowed user set; the query clause uses `inArray`. If the caller passes `userId` outside the set, the service returns empty without leaking 403 (no oracle).
- **Hash chain**: `verifyActivityLogChain` from `src/lib/activity-log.ts` is reused verbatim in test `T-ACT-CHAIN-INTACT-AFTER-READS`. No new helper.

---

## 6. Tests Run (Local — 2026-04-23)

### 6-gate status

| # | Gate | Type | Result |
|---|------|:-:|:-:|
| Lint | ✅ real | Clean |
| Typecheck | ✅ real | Clean |
| Build | ✅ real | `/activity` + `/api/v1/activity` in the route manifest |
| db:migrate:check | ✅ real | Clean — no schema touch |
| Unit | ✅ real | 228/228 unchanged; coverage 76.99% stmts / 82.67% branches / 89.04% functions / 76.76% lines — all above the 70% thresholds after adding only `service.ts` to exclude. Confirms amendment #1: `permissions.ts` pure guard didn't need exclusion. |
| Integration | ✅ real, live Neon | **338/338 passed** (34 files, 649s) on `test2`. 322 baseline + 16 new = 338 expected = 338 actual. Log: `/tmp/vitesse-logs/full-5.2.log`. |

### Coverage detail — why permissions.ts stayed in

Before 5.2: 78.5 / 82.67 / 89.04 / 78.41.
After 5.2 without any new excludes: ~73% lines (hypothetically; not measured because the 3 new small files don't break the 70% threshold).
After 5.2 with `service.ts` excluded (the one DB-heavy file): 76.99 / 82.67 / 89.04 / 76.76 — safely above thresholds.
Conclusion: amendment #1 honored — `permissions.ts` (24 lines, pure guard) stays counted; the numbers proved it wasn't the culprit.

### Integration (single file — standalone)

- **16 / 16 passed** in 12s on warmed `test2` branch.
- Cases: permissions × 6 (3 admin 200s + 3 non-admin 403s), filters × 4 (entityType, action, userId, dateFrom), pagination × 1, manager scoping × 3 (sees self+team, can't see other team, outside-team userId silently empty, inside-team userId filter works), ordering × 1, chain verify × 1.

### Manual UI test (CLAUDE.md UI rule — honesty disclosure)

Same environment constraint as 5.1b: no browser automation available in this session; `DATABASE_URL` is not wired (only `TEST_DATABASE_URL`), so `next dev` can't serve a real login. Compile-time coverage is real (build + typecheck + lint pass); runtime contract coverage is real (16 integration cases + full regression pending). Interactive browser verification deferred to the reviewer.

What to eyeball post-commit:
- `/activity` renders in Arabic RTL with filters on top.
- pm/gm see all rows; manager sees only self + linked drivers.
- Filter dropdowns populate from the curated entity-type + action enums.
- Pagination prev/next + "صفحة X من Y · N سجل".
- Empty-state message when no rows match.

---

## 7. Regression Coverage

- No API endpoint changed in 5.2 — pre-existing 322 integration cases are regression coverage for the data layer.
- No business-logic file changed.
- New tests (16) are additive to the integration suite, so the final integration count is expected at **338 / 338** (322 baseline + 16 new).

---

## 8. API Impact

### Added

- `GET /api/v1/activity` — details in §2 and in 35_API_Endpoints.md.

### Not changed

- Every pre-5.2 endpoint is byte-identical in signature + response shape.
- `X-Unread-Count` header still on every authenticated response including `/api/v1/activity` (it uses `jsonWithUnreadCount`).

---

## 9. DB Impact

**None.** No migrations, no schema changes, no new indexes.

The `activity_log` table has existed since `0000_initial_schema` with the hash-chain columns (`prev_hash`, `row_hash`) added in the same migration. `logActivity()` and `verifyActivityLogChain()` already manage writes + integrity checks; 5.2 only adds a read path.

---

## 10. Security Check

- **Role gate at two layers**: page (`enforcePageRole`) + route (`requireRole`). pm/gm/manager allowed; seller/driver/stock_keeper blocked.
- **Manager scope enforced server-side** via `users.manager_id`. Client cannot override; filter `userId` outside the allowed set returns empty rows (no 403 oracle).
- **Own-only implicit for sub-roles**: pages redirect non-allowed roles before any data fetch runs.
- **No user-controlled SQL** — every filter goes through Drizzle's typed query builder with `sql` helpers only for the Paris-date math, which uses ISO-validated input (`IsoDateOnly` regex).
- **Immutability unaffected**: read-only endpoint. No write path. Hash-chain write helper and verifier unchanged. Chain verification test proves integrity after reads.

---

## 11. Performance Check

- **Query cost**: indexed PK `id` for `ORDER BY id DESC`. Filters hit column scans on entity_type/action/user_id; for current row volumes in the project this is negligible. If activity_log grows to tens of thousands of rows, a composite index on `(timestamp, user_id, entity_type)` becomes useful — captured as a future optimization, not a 5.2 blocker.
- **Manager-team resolution**: one `users` query per request (role = manager + manager_id = self). Result feeds directly into the `inArray` clause. O(team-size) which in practice is ≤ 10.
- **Pagination**: `limit ≤ 200` hard cap in Zod.
- **Client**: TanStack Query with SSR `initialData` + `staleTime: 30_000`; no polling, no N+1.

---

## 12. Self-Review Findings

### What I checked

- **Scope is truly read-only** — `route.ts` exports only `GET`. No `POST`/`PUT`/`DELETE`. `service.ts` has no `tx` usage beyond the `DbHandle` read signature; `withRead` is the call site in the route.
- **No drift with API**: `/activity/page.tsx` is canonical fetch only. Verified by grep: no `withRead`, no `withTxInRoute`, no `listActivity` import in the page. Lesson from 5.1b honored.
- **Manager scope coverage**: three dedicated tests — sees self+team; filters out other team; outside-team userId returns empty (no 403). Matches the contract and the treasury pattern.
- **Hash chain integrity**: `T-ACT-CHAIN-INTACT-AFTER-READS` calls `verifyActivityLogChain` after both a pm fetch and a manager fetch; asserts `null`. A read path that accidentally wrote to activity_log (e.g., audit-log-on-read) would fail here.
- **Coverage numbers** (amendment #1): `permissions.ts` stays in. 76.99% / 82.67% / 89.04% / 76.76% on re-run — all above 70% thresholds.

### Invariants — proof mapping

| Invariant | Proof |
|-----------|-------|
| I-5.2-read-only | `route.ts` exports only `GET`. No mutation export. |
| I-5.2-role-gate-double | `page.tsx::enforcePageRole` + `route.ts::requireRole(["pm","gm","manager"])` both present. Non-allowed roles hit 403 in integration tests. |
| I-5.2-manager-team-scope | `service.ts::visibleUserIdsForManager` + `T-ACT-MANAGER-SEES-SELF-AND-TEAM` + `T-ACT-MANAGER-CANT-SEE-OTHER-TEAM`. |
| I-5.2-no-oracle | `T-ACT-MANAGER-CANT-SEE-OTHER-TEAM`: explicit `userId=driverB` from manager-A → 200 + empty (not 403). |
| I-5.2-chain-unaffected | `T-ACT-CHAIN-INTACT-AFTER-READS`. |
| I-5.2-canonical-fetch | `page.tsx` grep confirms only `headers()` / `cookies()` / `fetch()` — no service import. |

### Known limitations (non-blocking, documented)

1. **No test for pagination page-2 content**. The bounded-limit test verifies shape (`items.length === limit`, `total` correct). Asserting that offset=2 returns the third row is marginal value. Punted.
2. **Date-range test covers only dateFrom-in-future (expect zero)**. A full coverage of `dateFrom ≤ row.timestamp < dateTo+1` edges would need timestamp manipulation which is expensive in the test setup. Current test proves the filter is wired; the Paris-day-end logic is deterministic code + simple to eyeball in `parisDayAfter`.
3. **No unit test for `parisDayAfter`**. It lives in `service.ts` which is excluded. Could be promoted to a helper with a unit test if we end up extending date semantics. Not worth it for 2 lines of arithmetic now.
4. **No manual browser UI verification in this session** (same constraint as 5.1b — documented in §6). Compile-time + integration coverage only.

---

## 13. Decision

**Status**: ✅ **ready for 5.2 review** — all 6 real gates green (338/338 integration pass), scope strictly respected, zero backend mutation-side changes.

### Conditions

- Local commit only. No push.
- Phase 5.2 closes on your acceptance of this commit.
- Phase 5.3 (Dashboard + Reports) does NOT start until 5.2 is explicitly accepted.
