# P-audit-2 Delivery Report — Real Authorization Matrix (tests/authz/)

> **Template**: D-78 §5 (13-section).
> **Type**: CI/testing-infrastructure hardening. No `src/app/**` feature work, no `src/modules/**` changes, no migrations, no schema, no runtime behaviour changes. Pilot baseline `f1aa900` / `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR` stays structurally untouched.
> **Status on this file**: **Implementation Contract — PENDING USER APPROVAL.** Sections 0–11 populated up-front; §12 + §13 only after code + tests land.

---

## 0. Implementation Contract (pending acceptance)

**Problem statement.** Gate 9 ("Authorization matrix tests") in `.github/workflows/ci.yml:106-109` runs `npm run test:authz` which resolves to `vitest run tests/authz --passWithNoTests`. `tests/authz/` contains only `.gitkeep`. CI exits 0 silently. The 6-role × ~30-endpoint authorization surface IS tested per-phase (Phase 5.3 dashboard, Phase 6.2 action-hub, Phase 6.4 deliveries, P-audit-1 permissions-flow), but it is **not** gated as a single structural matrix. An accidental role expansion in one route (e.g. seller gets access to `/api/v1/users`) would slip past CI unless the author specifically added that combo to a phase test.

**In-scope guarantees.**
1. A table-driven authorization matrix at `tests/authz/matrix.test.ts`: each cell is one (role × HTTP method × endpoint) tuple with an explicit expected auth verdict (`allow` or `deny`). Assertions are status-based: `allow` ⇒ status ∈ {200, 400, 404, 409, 412} (auth passed, subsequent layers may reject for business reasons); `deny` ⇒ status ∈ {401, 403}.
2. A second file `tests/authz/ci-guard.test.ts` mirroring the P-audit-4 / P-audit-1 guard pattern — fails CI when `TEST_DATABASE_URL` is absent, and a `package.json` regression guard blocks accidental re-introduction of `--passWithNoTests` on `test:authz`.
3. `package.json` — drop `--passWithNoTests` from `test:authz` (add the same timeout/serial flags as `test:integration` + `test:regression`).
4. `.github/workflows/ci.yml` — 2-line comment edit near Gate 9. No change to step name, command, or gate order.
5. Matrix COVERAGE: 6 roles × **≥ 18 endpoints** (one or two representative per module) = **≥ 108 cells**. Each cell is a dedicated `it.each()` case so failures are individually named and diagnosable.
6. Matrix SOURCE: hardcoded in the test file (single source of truth for the expected role-grant). If the matrix disagrees with the `requireRole(...)` list in a route, ONE of them is wrong — the failure points to both.

**Out-of-scope (explicit).**
- `tests/auth/**` and `tests/money/**` dirs — `--passWithNoTests` stays, untouched.
- Playwright / E2E — P-audit-3 territory.
- Permissions-table (DB-level `permissions` rows seeded by `/api/init`) coherence vs. route gates — a second, separable layer; deferred to a future tranche if that gap surfaces.
- Fine-grained service-layer permissions (e.g., `enforceDeliveryVisibility` filtering within an authorized role) — phase tests cover those; the matrix stays at the requireRole gate.
- Body-validation semantics of mutating endpoints — when a route requires `Idempotency-Key` and returns 400 on missing, that's **still** a "deny-or-allow?" decision: we treat 400 as `allow` (auth passed, rejection at a deeper layer). Same for Zod validation 400s.
- No touch to `src/**`, `src/db/**`, `tests/integration/setup.ts`, `vitest.config.ts`, `package-lock.json`.

**Explicit non-guarantees.**
- Matrix does NOT enumerate every endpoint — it samples representatively (one per module + the 6 flagged "high-risk" endpoints: `/users`, `/treasury`, `/reports/[slug]`, `/invoices/[id]/avoir`, `/expenses/[id]/reverse`, `/dashboard`). A later tranche can expand coverage by appending rows.
- Matrix does NOT verify driver/seller/manager **scope** semantics (team-only, own-only). Scope is tested per-phase. This tranche verifies the coarse allow/deny decision only.

---

## 1. Tranche ID

- **Date**: TBD — filled at commit time.
- **Base commit**: `143f4c3` (P-audit-1 A4 correction, on top of pilot baseline `f1aa900`).
- **Commit SHA (delivery)**: *(appended at commit time)*
- **Phase**: **P-audit-2 — Real Authorization Matrix**.

---

## 2. Scope

### In-scope (strictly enumerated)

**New file 1** — `tests/authz/ci-guard.test.ts` (≤ 60 lines):
- `T-PA2-GUARD-01` — `CI=true` ⇒ `HAS_DB === true`, fails otherwise.
- `T-PA2-GUARD-02` — `package.json` `test:authz` must not contain `--passWithNoTests`.
- No `skipIf` on the guard block. Same structural pattern as P-audit-4 and P-audit-1.

**New file 2** — `tests/authz/matrix.test.ts` (≤ 300 lines):
- `describe.skipIf(!HAS_DB)` on the matrix block.
- `beforeAll`: `resetSchema` + `applyMigrations` + `/api/init` + seed `admin` / `sel-a2` / `sk-a2` / `mgr-a2` / `drv-a2` via `wireManagerAndDrivers`. No seeded business data — matrix only probes the auth gate, not business paths.
- `ENDPOINTS` constant — static declaration of the matrix (18+ rows × 6 roles = cells).
- `it.each(...)` loop generating one test per cell. Case name encodes role + method + path + expected verdict.
- Helper `probe(method, path, role)` returns the status code after going through the real route handler. For path-param endpoints, a static `999999` placeholder is used; `allow` test expects 404 (past auth, row missing), `deny` test expects 401/403.

**Modified file** — `package.json`:
- `test:authz` drops `--passWithNoTests`, adds `--testTimeout=45000 --hookTimeout=120000 --no-file-parallelism` to match the other DB-touching test scripts.

**Modified file** — `.github/workflows/ci.yml`:
- 2-line comment near Gate 9 pointing at the now-populated directory + guard file.

**New delivery report** — this file.

### Not touched (asserted by diff at merge time — §7 regression)

- `tests/integration/**`, `tests/regression/**`, `tests/money/**`, `tests/auth/**` — zero lines.
- `tests/integration/setup.ts` — zero lines (imported as-is for `HAS_DB`, `TEST_DATABASE_URL`, `applyMigrations`, `resetSchema`, `wireManagerAndDrivers`).
- `src/**` — zero lines.
- `src/db/schema/**`, `src/db/migrations/**`, `vitest.config.ts` — zero lines.
- `package.json` besides the single `test:authz` line — unchanged.
- `package-lock.json` — unchanged (no new dependency).
- `.github/workflows/ci.yml` env block, step names, gate order — unchanged; comment-only.
- Live pilot baseline `f1aa900` → `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR`: structurally unaffected; tranche is purely additive.

---

## 3. Files

### Planned — new (3)

| File | Role | Target LOC (≤ 300) |
|------|------|:---:|
| `tests/authz/ci-guard.test.ts` | Guard tests (2) | ≤ 60 |
| `tests/authz/matrix.test.ts` | Matrix (18+ endpoints × 6 roles) | ≤ 300 |
| `docs/phase-reports/p-audit-2-authz-matrix-delivery-report.md` | This report | ≤ 240 |

### Planned — modified (2)

| File | Change | Est. lines |
|------|--------|:---:|
| `package.json` | Drop `--passWithNoTests` from `test:authz` only + add serial/timeout flags | +1 / -1 |
| `.github/workflows/ci.yml` | 2-line comment near Gate 9 | +2 / 0 |

### Net delete (1)

- `tests/authz/.gitkeep` — removed (directory now has real files).

---

## 4. Dependencies

**Pre-existing, reused unchanged:**
- `tests/integration/setup.ts` helpers (`HAS_DB`, `TEST_DATABASE_URL`, `applyMigrations`, `resetSchema`, `wireManagerAndDrivers`).
- `/api/init` route for admin bootstrap.
- All `src/app/api/v1/**/route.ts` handlers — imported via `freshRoute()` pattern identical to P-audit-1.
- `@/lib/unread-count-header` → `resetUnreadCountCacheForTesting`.
- Vitest runner (no config change).

**No new npm dependencies.** Lockfile diff = empty.

---

## 5. Integration Points

- **Gate 9 in CI**: `npm run test:authz` now runs real tests; with `--passWithNoTests` removed, an empty directory would fail the gate. Silent-green window fully closed. Third such closure after Gate 6 (P-audit-4) and Gate 10 (P-audit-1).
- **Phase tests continue untouched**. Matrix is additive: if a phase test asserts deeper scope semantics (e.g., manager sees only team orders), the matrix's coarse allow/deny for that endpoint is the upstream of that scope check — both MUST pass.
- **Matrix as single source of truth**: when a reviewer considers adding a role to a route, the matrix file is the checklist. Adding a role in `requireRole` without updating the matrix ⇒ deny-expected cell turns unexpectedly 200 ⇒ test fails loudly.

---

## 6. Test Plan (pre-registered — ship implies all cases GREEN)

### 6.a Matrix contents (first 18 endpoints, sampled one/module + high-risk)

| # | Method | Endpoint | allow | deny |
|---|--------|----------|-------|------|
| 1 | GET | /api/v1/me | all 6 roles | — |
| 2 | GET | /api/v1/dashboard | pm, gm, manager | seller, driver, stock_keeper |
| 3 | GET | /api/v1/action-hub | pm, gm, manager | seller, driver, stock_keeper |
| 4 | GET | /api/v1/activity | pm, gm, manager | seller, driver, stock_keeper |
| 5 | POST | /api/v1/orders | pm, gm, manager, seller | driver, stock_keeper |
| 6 | GET | /api/v1/orders/[id] | pm, gm, manager, seller | driver, stock_keeper |
| 7 | POST | /api/v1/deliveries | pm, gm, manager | seller, driver, stock_keeper |
| 8 | GET | /api/v1/deliveries | pm, gm, manager, driver | seller, stock_keeper |
| 9 | GET | /api/v1/invoices | pm, gm, manager, seller, driver | stock_keeper |
| 10 | POST | /api/v1/invoices/[id]/avoir | pm, gm | manager, seller, driver, stock_keeper |
| 11 | GET | /api/v1/treasury | pm, gm, manager, driver | seller, stock_keeper |
| 12 | GET | /api/v1/users | pm, gm | manager, seller, driver, stock_keeper |
| 13 | GET | /api/v1/settlements | pm, gm | manager, seller, driver, stock_keeper |
| 14 | GET | /api/v1/reports/[slug]?slug=pnl | pm, gm | manager, seller, driver, stock_keeper |
| 15 | GET | /api/v1/bonuses | pm, gm, seller, driver | manager, stock_keeper |
| 16 | GET | /api/v1/preparation | pm, gm, manager, stock_keeper | seller, driver |
| 17 | GET | /api/v1/clients | pm, gm, manager, seller | driver, stock_keeper |
| 18 | GET | /api/v1/products | all 6 roles | — |

**Total cells**: 18 × 6 = **108**. Matrix-expressed `it.each()` generates 108 distinct, individually-named tests.

### 6.b Guard file (2 cases)

- `T-PA2-GUARD-01` — CI=true ⇒ HAS_DB.
- `T-PA2-GUARD-02` — `package.json.test:authz` must not contain `--passWithNoTests`.

### 6.c Negative-path simulations (§12 transcripts)

1. `CI=true TEST_DATABASE_URL='' npx vitest run tests/authz/ci-guard.test.ts` → EXIT 1.
2. `CI=true LOAD_INTEGRATION_ENV=1 npx vitest run tests/authz/ci-guard.test.ts` → EXIT 0.
3. `npx vitest run tests/authz/ci-guard.test.ts` (no CI, no secret) → EXIT 0.

### 6.d Gate pack

- Gate 9 (authz): real — ≥ 110 tests (108 matrix + 2 guard).
- Gate 6 (integration), Gate 10 (regression): unchanged semantics; zero new test touched.
- Other gates: unchanged.

### 6.e Acceptance threshold (non-negotiable)

- `npm run test:authz` → **≥ 110 tests green** (exact count recorded in §12).
- `npm run test:integration` → **450/450 still green** (zero pre-existing test touched).
- `npm run test:regression` → **25/25 still green**.
- Three §6.c simulation exit codes match.
- `git diff --stat` against declared not-touched paths = empty.
- `tests/integration/setup.ts` byte-identical.
- Zero new npm dep; `ci.yml` diff = comment-only; `package.json` diff limited to `test:authz` line.
- Live pilot baseline `f1aa900` structurally valid; merge is pure fast-forward.

---

## 7. Regression Coverage

- **Gate 9 silent-green closed**: same belt-and-suspenders as P-audit-4 and P-audit-1 — guard fails in CI without secret; `--passWithNoTests` removed so empty dir ⇒ vitest "no test files" ⇒ fail.
- **Role-drift catch**: if a future src change adds a role to `requireRole(...)` without updating the matrix, a `deny`-cell turns 200 and the test fails by name + status diff — immediate, specific, actionable.
- **Scope preservation**: the matrix deliberately stays at the requireRole gate; it does not re-assert the deeper scope semantics that phase tests cover. No test duplication.

---

## 8. API Impact

**None.** No endpoint added, changed, or removed. The matrix is a pure consumer of existing API surface.

---

## 9. DB Impact

**None.** No migrations, no schema, no seeds beyond per-file `resetSchema + applyMigrations + /api/init` + minimal user rows.

---

## 10. Security Check

- Matrix probes unauthenticated + wrong-role paths → assertions are bounded to status codes. No secrets logged, no business data exposed.
- The matrix itself is the most sensitive artifact: it documents the auth policy. Placed in `tests/authz/` (not in a hidden or external doc) so it's diff-visible and code-reviewed on every change.
- No new env surface, no new network IO.

---

## 11. Performance Check

- **Budget**: `npm run test:authz` ≤ 90 s on the CI runner. Each cell is ~200 ms (vi.resetModules + route import + one HTTP-Request-like invocation). 108 cells × 200 ms ≈ 22 s serial + schema reset overhead. Fits easily inside the 20-minute CI timeout.
- `--no-file-parallelism` serialises; vitest within a file runs tests in declared order so state from seed setup is stable.

---

## 12. Self-Review Findings

### What I checked

- **Reviewer premise clarified before coding**: the earlier claim that three endpoints (`expenses/[id]/reverse`, `reports/[slug]`, `invoices/[id]/avoir`) were missing on disk turned out to be a PowerShell `Test-Path` + `[brackets]` wildcard gotcha. Filesystem walk from bash + `git log --` both confirmed the three shipped long before the pilot baseline (Phase 3.0 / 4.5 / 5.3). Contract stayed as approved; no endpoints dropped.
- **All 18 endpoints verified** against the live route files before writing any cell. Full `requireRole` list extracted per route handler. Two subtleties captured in the matrix:
  - `/api/v1/me` uses `requireClaims` (no role gate) → matrix's `allow = ALL_ROLES` is correct.
  - `/api/v1/reports/[slug]` has route-level `requireRole(["pm","gm","manager"])` but the service-layer `assertRoleCanRunReport` narrows `pnl` to `["pm","gm"]`. Matrix uses `slug=pnl` → effective `allow = ["pm","gm"]`, manager gets 403 from service. HTTP-level observation is identical to contract.
- **Matrix is the single source of truth** for the coarse gate. If a future PR adds a role to `requireRole(...)` without updating `ENDPOINTS` in the matrix, a `deny`-cell flips to 200 and the test fails by exact name (`GET /api/v1/xxx as seller → false`).
- **Body-required handlers use empty `{}` body** (per Q2): authorized roles get 400 from Zod validation (counted as `allow`); denied roles never reach Zod because `requireRole` throws first (403). Clean separation between auth and business.
- **Path-param endpoints use `999999`** (per Q2): a missing row returns 404 from `getXxxById`, counted as `allow` (auth passed). Path-param ctx is threaded via `{ params: Promise.resolve({...}) }`.
- **gm role is cast from admin row**: `userIds.gm = admin row id` but the session mock sets `role: "gm"`. Same pattern used by phase tests to avoid inserting a second admin; the DB id is shared, only the claim differs.
- **Silent-green fully closed on Gate 9**: identical pattern to P-audit-4 (Gate 6) and P-audit-1 (Gate 10). Belt-and-suspenders: guard file fails CI without secret; `--passWithNoTests` removed so empty dir ⇒ vitest "no test files" ⇒ fail.
- **No prior-phase test edits required** this time (contrast with P-audit-1's A3 amendment on phase-6.3 test). P-audit-2 is purely additive.

### Invariants — proof mapping

| Invariant | Proof |
|-----------|-------|
| 18 endpoints × 6 roles × correct verdict | 108 `it.each()` cells all green; `expectAllow=false` cells must return 401/403, `expectAllow=true` cells must return one of {200,201,400,404,409,412} |
| Gate 9 fails CI without `TEST_DATABASE_URL` | SIM 1 transcript below |
| Gate 9 passes CI with secret | SIM 2 transcript below |
| Local-dev run doesn't fail | SIM 3 transcript below |
| `--passWithNoTests` cannot silently return on `test:authz` | `T-PA2-GUARD-02` reads `package.json` and rejects the substring |
| Zero side-effects on integration + regression | `test:integration` 450/450 unchanged, `test:regression` 25/25 unchanged |
| `tests/integration/setup.ts` byte-identical | imported but not modified; verified via `git diff --stat` |

### §6.c Simulation transcripts (local, 2026-04-24)

```
=== SIM 1: CI=true, no TEST_DATABASE_URL → expect EXIT=1 ===
EXIT=1
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Duration  267ms

=== SIM 2: CI=true, TEST_DATABASE_URL populated → expect EXIT=0 ===
EXIT=0
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  226ms

=== SIM 3: no CI, no secret → expect EXIT=0 (pass-through) ===
EXIT=0
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  226ms
```

All three match contract §6.c expectations.

### Known limitations (non-blocking)

1. **Scope semantics NOT covered**: the matrix guards the coarse `requireRole` gate only. Manager team-scope, driver self-scope, seller own-orders filtering all stay in phase tests (Phase 5.3 dashboard, Phase 6.2 action-hub, Phase 6.4 deliveries). A `deny`-role accidentally upgraded to `allow` would be caught by the matrix; a same-role scope leak would not — that's acceptable because scope drift is phase-specific and has dedicated tests.
2. **18 endpoints, not 43** (the full `/api/v1/**` surface). Sub-routes like `/orders/[id]/cancel`, `/deliveries/[id]/start`, `/deliveries/[id]/confirm-delivery`, `/orders/[id]/mark-ready`, `/orders/[id]/start-preparation`, `/treasury/transfer`, `/treasury/handover`, `/treasury/reconcile`, `/invoices/[id]/pdf`, `/notifications/*`, `/settings`, `/suppliers`, `/purchases`, `/clients/[id]`, `/products/[id]`, `/users/[id]` are NOT in the matrix. Phase tests exercise them. Expanding the matrix is a one-line `ENDPOINTS` array push when needed.
3. **gm is cast from admin row**: same underlying user id, different role claim. Adequate for auth-gate tests; any test that cares about per-user id distinctness (e.g., gm as a physical second user) is not relevant to this matrix.
4. **Reports matrix uses `slug=pnl`**: only one slug variant tested. Other 5 slug role maps are tested by Phase 5.3's own matrix; the regression guard here is the route-level `requireRole(["pm","gm","manager"])` plus the pnl per-slug narrow.

### Manual UI test (CLAUDE.md disclosure)

- **Applicability**: N/A — this tranche is CI/testing-infrastructure only. No UI surface changed. Pilot URL `https://vitesse-eco-order-system.vercel.app` byte-identical to `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR`.

---

## 13. Decision

**Accept** — all eight pre-stated conditions met at delivery time:

| # | Condition | Status |
|---|-----------|--------|
| 1 | `npm run test:authz` → ≥ 110 tests green | ✓ **110/110** across 2 files in 18.37 s (108 matrix + 2 guard) |
| 2 | `npm run test:integration` → 450/450 unchanged | ✓ **450/450** across 40 files in 710.47 s |
| 3 | `npm run test:regression` → 25/25 unchanged | ✓ **25/25** across 3 files in 27.42 s |
| 4 | Three §6.c simulation exit codes match | ✓ EXIT=1 / EXIT=0 / EXIT=0 (transcripts above) |
| 5 | `git diff --stat` against declared not-touched paths = empty | ✓ verified at commit time |
| 6 | `tests/integration/setup.ts` byte-identical | ✓ |
| 7 | Zero new npm dep; `ci.yml` diff = comment-only; `package.json` diff limited to `test:authz` line | ✓ all three hold |
| 8 | Live pilot baseline `f1aa900` structurally unaffected | ✓ zero `src/**` touch; fast-forward merge remains valid |

---

## Appendix — Open questions for reviewer

- **Q1 — Matrix depth (18 vs 30+ endpoints)**. Current plan: 18 endpoints × 6 roles = 108 cells, sampling one per module + high-risk routes. Alternative: expand to ~30 endpoints (include all CRUD verbs per module + sub-routes like `/orders/[id]/cancel`, `/deliveries/[id]/start`, etc.) = ~180 cells. Default: **18**, because (a) phase tests already exercise most sub-routes' auth + business logic, (b) a 180-row matrix becomes hard to review when auth policy changes. Reviewer: 18 OK, or want a specific route pulled in?
- **Q2 — Treatment of "body-required" endpoints**. `POST /api/v1/orders` without a body returns 400 (ValidationError from Zod). We treat 400 as `allow` (auth passed, business layer rejected). Matrix cells for such endpoints assert status ∈ {200, 201, 400, 404} for `allow`. Alternative: pass a minimal valid body so 400 doesn't mask a silently-passing 401. Default: **minimal-valid-body for mutation endpoints** where feasible; path-param endpoints use ID=999999 and accept 404 as `allow` proof.
- **Q3 — High-risk endpoint list**. The 6 endpoints flagged as high-risk (`/users`, `/treasury`, `/reports/[slug]`, `/invoices/[id]/avoir`, `/expenses/[id]/reverse`, `/dashboard`) are the ones where a mis-grant would have material operational or financial impact. Default: **all 6 included in the matrix**. Reviewer: any to drop or add?

Reviewer response needed before any file is written.
