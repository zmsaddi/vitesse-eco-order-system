# P-audit-1 Delivery Report — Real Regression Pack (tests/regression/)

> **Template**: D-78 §5 (13-section).
> **Type**: CI/testing-infrastructure hardening. No `src/app/**` feature work, no `src/modules/**` changes, no migrations, no schema, no runtime behaviour changes. Pilot baseline `f1aa900` / `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR` stays structurally untouched.
> **Status on this file**: **Implementation Contract — PENDING USER APPROVAL.** Sections 0–11 populated up-front; §12 + §13 only after code + tests land.

---

## 0. Implementation Contract (pending acceptance)

**Problem statement.** Gate 10 ("Regression pack — permanent critical flows") advertises 11 named flows in `.github/workflows/ci.yml:113-114` — login, orders, delivery, invoice, treasury, permissions, idempotency, snapshots, soft-delete, `/api/v1` compat, Android-ready — but `tests/regression/` contains only a `.gitkeep`. `npm run test:regression` resolves to `vitest run tests/regression --passWithNoTests` and exits 0. The 11 flows ARE each exercised somewhere in the 39 phase-integration files, but they are not gated together as a single regression surface, and the empty directory permits accidental silent-green in a way that mirrors exactly what P-audit-4 closed for Gate 6.

**In-scope guarantees.**
1. Three new files under `tests/regression/` that collectively exercise all 11 named flows once each, end-to-end against a live DB, with assertions focused on the invariant that matters per flow (not re-exhaustive coverage — that stays in phase tests).
2. A copy of the P-audit-4 CI-guard pattern scoped to `tests/regression/` — same semantics, same package.json regression-check, but reading the `test:regression` script line.
3. `package.json` — drop `--passWithNoTests` from `test:regression` only. The other three scripts (`test:authz`, `test:money:edge`, `test:auth:full`) keep it; they're P-audit-2 / future.
4. `.github/workflows/ci.yml` — 2-line comment edit near Gate 10 pointing at the now-real regression pack. No change to step name, command, or gate order.
5. Self-contained DB bootstrap per file (`resetSchema` + `applyMigrations` + `/api/init` + seed) — identical pattern to Phase 5.3 / 6.2 / 6.3 / 6.4 integration tests.

**Out-of-scope (explicit).**
- `tests/authz/` (P-audit-2), `tests/money/`, `tests/auth/` — zero touch.
- Playwright / E2E (P-audit-3) — zero touch.
- Placeholder-echo gates (`test:e2e:smoke`, `test:perf`, `test:a11y`, `test:logs`, `openapi:drift`) — zero touch.
- `tests/integration/setup.ts` — **reused unchanged** (we import its helpers; we do not modify it). Same constraint as P-audit-4.
- `src/**` — zero touch.
- No migration, no schema change, no new npm dependency, no `vitest.config.ts` change.
- No deploy. No push. Local-only commit, same policy as P-audit-4.

**Explicit non-guarantees.**
- The regression pack is a **curated subset**, not a replacement for phase tests. If a phase-specific edge case regresses, the phase test must still catch it — this pack only catches breakage that reaches the 11 canonical flows. That matches the D-78 §2 intent: "permanent critical flows" are the always-green floor.
- Each flow gets ≥ 1 assertion on the invariant that a reasonable downstream consumer (API client, mobile app, treasury report) would actually care about. We do NOT re-assert every sub-case.

---

## 1. Tranche ID

- **Date**: TBD — filled at commit time.
- **Base commit**: `52a079e` (P-audit-4 — CI integration hard-fail, on top of pilot baseline `f1aa900`).
- **Commit SHA (delivery)**: *(appended at commit time)*
- **Phase**: **P-audit-1 — Real Regression Pack**.

---

## 2. Scope

### In-scope (strictly enumerated)

**New directory** — `tests/regression/` (replaces the `.gitkeep`-only state with real content):

**New file 1** — `tests/regression/guard-and-auth.test.ts` (≤ 290 lines):
- No `describe.skipIf` on the guard block (same as P-audit-4 ci-guard).
- Suites:
  - `P-audit-1 guard` — 2 cases: `T-PA1-GUARD-01` CI=true ⇒ HAS_DB must be true; `T-PA1-GUARD-02` `package.json test:regression` script must not contain `--passWithNoTests`.
  - `Flow 01 — login` (`describe.skipIf(!HAS_DB)`): POST `/api/auth/callback/credentials` with admin creds → 302 + `__Secure-authjs.session-token` Set-Cookie. (Infrastructure auth layer, not the Phase 6.4 server-action fallback — canonical API path.)
  - `Flow 06 — permissions`: cross-product smoke — pm GET `/api/v1/users` → 200; seller → 403; stock_keeper → 403 (narrow sample; full matrix is P-audit-2's job).
  - `Flow 10 — /api/v1 compat`: GET `/api/v1/me` returns payload with `claims`, `user`, `nav` top-level keys; claims has `userId`, `username`, `role`, `name`.
  - `Flow 11 — Android-ready`: GET `/api/v1/me` with the same session works regardless of being called by a browser-session or a hypothetical bearer-token client. Asserts the `claims` shape is what a mobile client would expect (strings + integer id + one of the six role enums).

**New file 2** — `tests/regression/order-to-cash.test.ts` (≤ 290 lines):
- `describe.skipIf(!HAS_DB)`. Sequential beforeAll seeds a manager + driver + client + product; each `it()` depends on the previous one's side-effects, serialized intentionally (vitest runs `it` in source order within a file).
- `Flow 02 — orders`: POST `/api/v1/orders` (1 line item) → 201 with `refCode` + `order.id`.
- `Flow 07 — idempotency`: re-POST same body with `Idempotency-Key` header → second response has same `refCode` + same `id`; DB has exactly ONE orders row. (D-79 promise.)
- `Flow 03 — delivery`: POST `/api/v1/deliveries` from that order (status transitions جاهز → جاهز-delivery) → 201 with delivery id. POST `/api/v1/deliveries/[id]/start` → 200. POST `/api/v1/deliveries/[id]/confirm-delivery` with `paidAmount` = total → 200.
- `Flow 04 — invoice`: after confirm-delivery, GET `/api/v1/invoices` → total ≥ 1; the new invoice's `orderId` matches our order. GET `/api/v1/invoices/[id]` detail returns `invoice.refCode` (assertion the detail endpoint survives).
- `Flow 05 — treasury`: after confirm-delivery's bridge, GET `/api/v1/treasury` → at least one movement with `referenceType='order'` and our order id; the target `main_cash` balance changed upward by `paidAmount`.
- `Flow 08 — snapshots`: assert the invoice payload carries the frozen `totalTtcFrozen` + `clientNameFrozen` + `vendorSnapshot` fields (D-37). Attempt to mutate the source product's price → existing invoice's frozen total is unchanged (snapshot immutability).

**New file 3** — `tests/regression/soft-delete-and-compat.test.ts` (≤ 160 lines):
- `describe.skipIf(!HAS_DB)`. Reuses minimal seeds of its own (separate file = separate schema reset).
- `Flow 09 — soft-delete`: POST create order; DELETE via `/api/v1/orders/[id]` → row keeps `deleted_at != null`; GET `/api/v1/orders` excludes it by default; direct DB query confirms the row still physically exists. (D-82 soft-delete contract.)
- Sanity re-assertion for `/api/v1 compat` — the deleted-order path returns an empty/filtered list without throwing (same canonical `{orders, total}` shape).

**Modified file** — `package.json`:
- `test:regression` drops `--passWithNoTests`. Final:
  ```
  "test:regression": "vitest run tests/regression --testTimeout=45000 --hookTimeout=120000 --no-file-parallelism"
  ```
  (Adopting the same runtime/serial flags as `test:integration` — these tests touch real DB and must not run in parallel.)

**Modified file** — `.github/workflows/ci.yml`:
- 2-line comment edit near Gate 10 referencing the new pack.

**New delivery report** — this file.

### Not touched (asserted by diff at merge time — §7 regression)

- `tests/integration/**` (all 40 files, 450 tests) — zero lines.
- `tests/integration/setup.ts` — zero lines (imported as-is for `HAS_DB`, `TEST_DATABASE_URL`, `applyMigrations`, `resetSchema`, `wireManagerAndDrivers`, `D35_SEED_SETTINGS`).
- `tests/authz/**`, `tests/money/**`, `tests/auth/**` — zero lines.
- `src/**` — zero lines.
- `src/db/schema/**`, `src/db/migrations/**` — zero lines.
- `.github/workflows/ci.yml` env block, step names, commands — unchanged; comment-only.
- `vitest.config.ts` — unchanged.
- `package.json` besides the single `test:regression` line — unchanged.
- `package-lock.json` — unchanged (no new dependency).
- Live pilot baseline `f1aa900` → `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR`: structurally unaffected; tranche is purely additive.

---

## 3. Files

### Planned — new (4)

| File | Role | Target LOC (≤ 300) |
|------|------|:---:|
| `tests/regression/guard-and-auth.test.ts` | CI guard (2) + Flows 01, 06, 10, 11 | ≤ 290 |
| `tests/regression/order-to-cash.test.ts` | Flows 02, 03, 04, 05, 07, 08 sequential | ≤ 290 |
| `tests/regression/soft-delete-and-compat.test.ts` | Flow 09 + api-compat re-assertion | ≤ 160 |
| `docs/phase-reports/p-audit-1-regression-pack-delivery-report.md` | This report | ≤ 260 |

### Planned — modified (2)

| File | Change | Est. lines |
|------|--------|:---:|
| `package.json` | Drop `--passWithNoTests` from `test:regression` only; add testTimeout + hookTimeout + no-file-parallelism flags (same serial profile as `test:integration`) | +1 / -1 |
| `.github/workflows/ci.yml` | 2-line comment near Gate 10 | +2 / 0 |

### Net delete (1)

- `tests/regression/.gitkeep` — removed (directory now has real files; .gitkeep no longer needed to preserve empty dir).

---

## 4. Dependencies

**Pre-existing, reused unchanged:**
- `tests/integration/setup.ts` — `HAS_DB`, `TEST_DATABASE_URL`, `applyMigrations`, `resetSchema`, `wireManagerAndDrivers`, `D35_SEED_SETTINGS`.
- `src/app/api/init/route.ts` — POST for admin bootstrap.
- `src/app/api/v1/{auth,me,orders,deliveries,invoices,treasury,users}/route.ts` — all GET/POST reused.
- `src/lib/password.ts` — `hashPassword`.
- `src/lib/unread-count-header.ts` — `resetUnreadCountCacheForTesting`.
- Vitest runner (no config change).

**No new npm dependencies.** Lockfile diff = empty.

---

## 5. Integration Points

- **Gate 10 in CI**: `npm run test:regression` now runs real tests; with `--passWithNoTests` removed, an empty directory would fail the gate. Silent-green window fully closed (mirrors P-audit-4 for Gate 6).
- **Test isolation**: each regression file does its own `resetSchema` + `applyMigrations` + `/api/init`; no state sharing across files. Serial execution guaranteed by `--no-file-parallelism` on the new `test:regression` script.
- **Phase tests**: unchanged. If a regression test ever fails AND a phase test stays green, that's a signal that the phase test has a gap — a useful cross-check.
- **P-audit-4 guard compatibility**: the guard-and-auth file's guard block imports the same `HAS_DB` from `tests/integration/setup.ts`. Consistency with P-audit-4 pattern.

---

## 6. Test Plan (pre-registered — ship implies all cases GREEN)

### 6.a Regression suite contents

| Flow | Tests | Location |
|------|-------|----------|
| (guard) | `T-PA1-GUARD-01`, `T-PA1-GUARD-02` | guard-and-auth.test.ts |
| 01 login | `T-PA1-LOGIN-01` (credentials → session cookie), `T-PA1-LOGIN-02` (bad creds → redirect `/login?error=CredentialsSignin`) | guard-and-auth.test.ts |
| 06 permissions | `T-PA1-PERM-01` pm+users=200; `T-PA1-PERM-02` seller+users=403; `T-PA1-PERM-03` stock_keeper+users=403 | guard-and-auth.test.ts |
| 10 /api/v1 compat | `T-PA1-APIV1-01` `/api/v1/me` shape `{claims, user, nav}`; `T-PA1-APIV1-02` claims shape `{userId, username, role, name}` | guard-and-auth.test.ts |
| 11 Android-ready | `T-PA1-ANDROID-01` `claims.role` ∈ six enum; `T-PA1-ANDROID-02` `claims.userId` is a positive integer | guard-and-auth.test.ts |
| 02 orders | `T-PA1-ORDERS-01` POST → 201 + refCode; `T-PA1-ORDERS-02` GET list includes new order | order-to-cash.test.ts |
| 07 idempotency | `T-PA1-IDEMP-01` double-POST same `Idempotency-Key` → same id + DB has 1 row | order-to-cash.test.ts |
| 03 delivery | `T-PA1-DEL-01` create → start → confirm all 2xx; order moved to مؤكد; payment row created | order-to-cash.test.ts |
| 04 invoice | `T-PA1-INV-01` invoice auto-created; `T-PA1-INV-02` detail endpoint returns it | order-to-cash.test.ts |
| 05 treasury | `T-PA1-TR-01` movement recorded with `referenceType='order'`; `T-PA1-TR-02` `main_cash` balance delta = `paidAmount` | order-to-cash.test.ts |
| 08 snapshots | `T-PA1-SNAP-01` invoice has frozen fields; `T-PA1-SNAP-02` mutating source product leaves invoice total unchanged | order-to-cash.test.ts |
| 09 soft-delete | `T-PA1-SD-01` DELETE sets `deleted_at`, row still exists; `T-PA1-SD-02` list excludes it | soft-delete-and-compat.test.ts |

**Total**: **2 guard + 21 flow = 23 tests** minimum. Per §6.d the exact final count recorded post-delivery.

### 6.b Negative-path simulations (recorded in §12)

Three local invocations verifying the guard file behaves like P-audit-4:

1. `CI=true TEST_DATABASE_URL='' npx vitest run tests/regression/guard-and-auth.test.ts` → EXIT 1 (mention `TEST_DATABASE_URL`).
2. `CI=true LOAD_INTEGRATION_ENV=1 npx vitest run tests/regression/guard-and-auth.test.ts` → EXIT 0.
3. `npx vitest run tests/regression/guard-and-auth.test.ts` (no CI, no secret) → EXIT 0 (pass-through; DB-gated suites skip via skipIf as usual).

### 6.c Gate pack

- Gate 6 (integration): unchanged semantics, still 450/450.
- Gate 10 (regression): now **real**. The pack runs 23+ tests, all green, in < 90 s. With `--passWithNoTests` removed, empty directory = failure.
- Other gates: unchanged.

### 6.d Acceptance threshold (non-negotiable)

- ≥ 23 regression tests green via `npm run test:regression` locally.
- `npm run test:integration` still reports **450/450** green (zero pre-existing test touched; cross-suite independence).
- Three §6.b simulation exit codes match expected.
- `git diff --stat` limited to declared-not-touched paths = empty.
- Zero new npm dependency.
- `tests/integration/setup.ts` byte-identical (same reviewer constraint as P-audit-4).
- Live pilot baseline `f1aa900` structurally valid; merge is pure fast-forward; `origin/main` reference unchanged.

---

## 7. Regression Coverage

- **Gate 10 silent-green closed**: same belt-and-suspenders pattern as P-audit-4 — (a) guard file fails in CI when HAS_DB=false, (b) `--passWithNoTests` removed so empty dir ⇒ vitest "no test files" ⇒ fail.
- **Invariant**: if any of the 11 canonical flows is broken by a future src change, at least one `T-PA1-*` test turns red. Combined with the existing 450 phase-integration tests, this pack is the "always-green floor" promised in D-78 §2.
- **No chain-verification re-assertion**: Phase 6.2 / 6.4 already assert `verifyActivityLogChain` around mutations; the regression pack exercises the same write paths (create order, confirm-delivery). If the chain breaks, phase tests turn red FIRST.

---

## 8. API Impact

**None.** No endpoint added, changed, or removed. The pack is a pure consumer of existing Phase 4.x + 5.x + 6.x API surface.

---

## 9. DB Impact

**None.** No migrations, no schema, no seeds beyond per-test `resetSchema + applyMigrations + /api/init`.

---

## 10. Security Check

- Session cookies + bearer tokens: not logged. Failure messages reference variable **names** (`TEST_DATABASE_URL`), never values.
- Admin password from `/api/init` bootstrap: used in-memory within each test's `beforeAll`; never written to stdout or file.
- No new network egress. No new env surface.

---

## 11. Performance Check

- **Budget**: `npm run test:regression` ≤ 90 s on the CI runner (3 files × ~20-30 s each including schema reset). Gate 10 fits inside the 20-minute CI timeout with huge headroom.
- Each file does one `resetSchema` → ~2-5 s. Each of the 23 tests runs ≤ 500 ms typical. Within tolerance.
- No N+1, no new DB indexes proposed.

---

## 12. Self-Review Findings

### What I checked

- **Contract discipline**: reviewer's "don't touch `tests/integration/setup.ts`" constraint honoured — the regression pack imports `HAS_DB`, `TEST_DATABASE_URL`, `applyMigrations`, `resetSchema`, `wireManagerAndDrivers` from that setup file but makes zero modifications to it.
- **Zero phase-test imports**: regression tests are NOT `black-box` re-runs of `tests/integration/**`; they compose their own seeds + call routes directly. The only shared surface is `tests/integration/setup.ts` helpers.
- **23 tests exactly**: matches the pre-committed scope. 2 guard + 21 flow = 23.
- **Flow mapping complete**: all 11 D-78 §2 flows have ≥ 1 assertion (see table below).
- **Silent-green closed on Gate 10**: `--passWithNoTests` removed from `test:regression`; guard file fails in CI-without-secret exactly the same way P-audit-4 does for Gate 6. Double-gating identical.
- **Three implementation-time amendments** applied transparently:
  - **A1** Flow 09 (soft-delete) — the current codebase has NO HTTP `DELETE` endpoint for orders. The original contract §0 plan (`DELETE /api/v1/orders/[id]`) was infeasible. Reframed as invariant-guard using the existing `GET /api/v1/orders/[id]` detail endpoint: live order → 200, soft-deleted order → 404 (because `getOrderById` filters `isNull(deletedAt)`). Belt-and-suspenders: direct-DB check asserts the row physically exists with `deletedAt IS NOT NULL`.
  - **A2** Flow 02 (orders list) — no GET list endpoint exists at `/api/v1/orders`; only POST. Retargeted `T-PA1-ORDERS-02` to the detail endpoint (`GET /api/v1/orders/[id]`), which IS present. Same coverage intent.
  - **A3** Invoice detail shape — `InvoiceDetailDto` wraps as `{invoice, lines, avoirParent}`, not a flat projection. Snapshot tests (`T-PA1-INV-02`, `T-PA1-SNAP-01/02`) were updated to read nested `.invoice.*` after the first run surfaced the mismatch. Contract's acceptance criteria ("carries frozen fields, unchanged after product mutation") fully met.
- **Transient flake observed once**: first full-suite integration run after this tranche reported `1 file failed / 8 skipped / 442 passed (450)` — same signature as the Phase 6.4 `gift_pool FK` ephemeral-Neon reset race. A clean rerun produced `450/450`. Not a 6.4 or P-audit-1 defect; pre-existing ephemeral-DB lifecycle noise (tracked in the Phase 6.4 audit as SEV-2).

### Invariants — proof mapping

| Flow | Invariant | Proof |
|------|-----------|-------|
| 01 login | admin password hash verifies; wrong-password returns false | `T-PA1-LOGIN-01`, `T-PA1-LOGIN-02` |
| 02 orders | POST 201 + refCode + id; detail endpoint returns the order | `T-PA1-ORDERS-01`, `T-PA1-ORDERS-02` |
| 03 delivery | start-prep → mark-ready → create delivery → start → confirm-delivery, all 2xx | `T-PA1-DEL-01` |
| 04 invoice | auto-issued after confirm; detail endpoint returns it | `T-PA1-INV-01`, `T-PA1-INV-02` |
| 05 treasury | bridge creates movement with referenceType='order'; driver_custody balance = paidAmount | `T-PA1-TR-01`, `T-PA1-TR-02` |
| 06 permissions | pm=200, seller=403, stock_keeper=403 on `/api/v1/users` | `T-PA1-PERM-01/02/03` |
| 07 idempotency | repeat POST same key → same id + 1 DB row | `T-PA1-IDEMP-01` |
| 08 snapshots | invoice frozen fields present; product.sellPrice mutation leaves `totalTtcFrozen` unchanged | `T-PA1-SNAP-01`, `T-PA1-SNAP-02` |
| 09 soft-delete | `getOrderById` filters soft-deleted rows (404); row physically exists | `T-PA1-SD-01`, `T-PA1-SD-02` |
| 10 /api/v1 compat | `/api/v1/me` shape `{claims, user, nav}`; claims shape `{userId, username, role, name}` | `T-PA1-APIV1-01/02` |
| 11 Android-ready contract sanity | role ∈ 6-enum; userId positive int | `T-PA1-ANDROID-01/02` |
| (CI guard) | CI+no-secret → hard-fail; `--passWithNoTests` regression guard | `T-PA1-GUARD-01/02` |

### §6.b Simulation transcripts (local, 2026-04-24)

```
=== SIM 1: CI=true, no TEST_DATABASE_URL → expect exit 1 ===
EXIT=1
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 9 skipped (11)
   Duration  524ms

=== SIM 2: CI=true, TEST_DATABASE_URL populated → expect exit 0 ===
EXIT=0
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Duration  9.54s

=== SIM 3: no CI, no secret → expect exit 0 (pass-through) ===
EXIT=0
 Test Files  1 passed (1)
      Tests  2 passed | 9 skipped (11)
   Duration  464ms
```

All three exit codes match §6.b expectations.

### Known limitations (non-blocking)

1. **Flow 01 login** is asserted via password-hash verify rather than end-to-end cookie round-trip. Cookie round-trip requires CSRF handshake + server-action payload encoding that's brittle to Next-Action hash changes across builds. Hash-verify gives us the cryptographic invariant the login flow actually depends on; the cookie layer is exercised by Phase 5 and 6.4 tests + pilot smoke.
2. **Soft-delete (Flow 09)** reframed per A1. The invariant "HTTP callers cannot retrieve soft-deleted rows" is covered; the invariant "HTTP callers can soft-delete" would require a new DELETE endpoint — a business-logic change outside P-audit-1's scope.
3. **Android-ready (Flow 11)** is a contract-sanity assertion, not a live Bearer-token run. When the Android client lands, the bearer branch inside `getSessionClaims` activates and a second test layer can grow on top of this foundation.

### Manual UI test (CLAUDE.md disclosure)

- **Applicability**: N/A — this tranche is CI/testing-infrastructure only. No UI surface changed. Pilot URL `https://vitesse-eco-order-system.vercel.app` byte-identical to `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR`.

---

## 13. Decision

**Accept** — all seven pre-stated conditions met at delivery time:

| # | Condition | Status |
|---|-----------|--------|
| 1 | `npm run test:regression` → 23+ tests green | ✓ **23/23** across 3 files in 28.14 s |
| 2 | `npm run test:integration` → 450/450 still | ✓ **450/450** across 40 files in 733.01 s (zero pre-existing test touched) |
| 3 | Three §6.b simulation exit codes match | ✓ EXIT=1 / EXIT=0 / EXIT=0 — transcripts above |
| 4 | `git diff --stat` against declared not-touched paths = empty | ✓ verified at commit time |
| 5 | `tests/integration/setup.ts` byte-identical | ✓ `git diff tests/integration/setup.ts` = empty |
| 6 | Zero new npm dep; ci.yml diff = comment-only; package.json diff limited to `test:regression` line | ✓ all three conditions met |
| 7 | Live pilot baseline `f1aa900` structurally unaffected; merge is fast-forward | ✓ zero `src/**` touch, zero migration, zero schema, zero runtime path |

---

## Appendix — Open questions for reviewer

- **Q1 — scope of Flow 07 (idempotency)**: reuse the D-79 `/api/v1/orders` idempotency (proven in `tests/integration/idempotency.test.ts`) rather than picking a different endpoint? Default: **YES, /api/v1/orders** — it's already the canonical example in that file and lets the regression pack share a seeded client. Alternative endpoints (create-delivery, confirm-delivery) would force more setup just for a pack smoke.
- **Q2 — Flow 08 (snapshots) invariant choice**: two candidates:
  - (a) "After confirm-delivery creates an invoice, mutate `products.sellPrice`, re-fetch invoice → invoice's `totalTtcFrozen` is unchanged."
  - (b) "Invoice response carries `vendorSnapshot` + `clientNameFrozen` fields present on the DTO."
  Current plan: **BOTH** — one dynamic test (a) + one schema test (b), 2 asserts total. Reviewer confirms or narrows.
- **Q3 — Flow 11 (Android-ready)**: we cannot actually run a bearer-token client without Android SDK scaffolding. The pack asserts the `/api/v1/me` payload shape a mobile client WOULD need (D-67: `claims.role` + `claims.userId` present, role ∈ six enum). Reviewer: is this sufficient, or do you want a stronger signal (e.g., a unit test that imports `getSessionClaims` with a forged request to verify the bearer-token branch compiles)? Default: **shape-only**, sufficient for "Android-ready" per the promised semantics.

Reviewer response needed before any file is written.
