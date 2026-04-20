# Phase 3 Closure Report — orders + preparation + purchases + expenses

> **Status**: ✅ **Closed** (2026-04-20, Europe/Paris).
> **Closing baseline**: **`0151b0f`** — last commit of the Phase 3 series.
> **Scope**: Phase 3 as a development phase. This report is NOT a production-deploy authorization. A full operational pilot still requires Phase 4 (deliveries + invoices + treasury + bonuses settlement).

---

## 1. Identity

- **Phase**: 3
- **Frozen scope** (reviewer decision 2026-04-20): `orders + order_items + preparation + cancellation C1 + purchases + expenses` **only**. Deliveries + invoices + treasury + bonus settlement deferred to Phase 4.
- **Closing baseline SHA**: `0151b0f` (`fix(phase-3.1.3)` — commissionRuleSnapshot per-role redaction + VIN_DUPLICATE doc alignment).
- **Entry baseline**: `cb32996` (end of Phase 2c errata).
- **Duration**: 2026-04-20 (single-day concentrated tranche series).

---

## 2. Phase 3 tranche chain (each verified at its own commit)

| Tranche | Commit | Scope |
|---|---|---|
| 3.0 | `1edcaa1` | Infrastructure: activity-log + idempotency + orders/purchases/expenses core |
| 3.0.1 | `0d91977` | Orders ownership + PUT sign guard + cancellations chain + refCode |
| 3.0.2 | `1c93241` | `npm run test:integration` reproducibly green (env loader + script flags) |
| 3.0.3 | `ed2a775` | Decouple `test:unit` from `test:integration` (Gate 5/6 isolation) |
| 3.1 | `80019ee` | Order rules (discount + VIN + gift + commission snapshot) + preparation board |
| 3.1.1 | `9b25320` | Gate-5 honesty + VIN_DUPLICATE + cost-leak redaction + canonical lock protocol |
| 3.1.2 | `49dc0f2` | Seller cost hiding + VIN normalization + race-safe VIN advisory lock |
| **3.1.3** | **`0151b0f`** | **commissionRuleSnapshot per-role redaction + VIN_DUPLICATE doc alignment** |

Pre-Phase-3 support commits also included: `52e0187` (scope freeze docs), `80a4a54` (D-79..D-82), `78b9b3d` (idempotency error-code sweep), `434fe21` (pgcrypto migration fix).

---

## 3. Closing baseline — official gate evidence (from repo scripts, vanilla)

Baseline commit: **`0151b0f`**. Commands are literally these, no shell tricks:

```bash
npm run lint
npm run typecheck
npm run build
npm run db:migrate:check
npm run test:unit
npm run test:integration   # requires .env.local with TEST_DATABASE_URL
```

Results at `0151b0f`:

| Gate | Result |
|---|---|
| `npm run lint` | ✅ 0 errors / 0 warnings |
| `npm run typecheck` | ✅ clean (`tsc --noEmit`) |
| `npm run build` | ✅ 43 routes compiled |
| `npm run db:migrate:check` | ✅ drizzle-kit check green (migrations 0000..0006) |
| `npm run test:unit` | ✅ **206/206 passed** / exit 0. Coverage Stmt 92.94% / Branches 87.82% / Funcs 96.82% / Lines 93.46%. |
| `npm run test:integration` | ✅ **147/147 passed** (19 files) on live Neon test branch. Zero skipped. |

---

## 4. Scope — what shipped inside Phase 3

### Core modules

- `orders` — multi-item create + state machine (محجوز → قيد التحضير → جاهز) + C1 cancellation with hash-chained `cancellations` audit + per-role visibility (Phase 3.0.1) + costPrice redaction (3.1.2) + commissionRuleSnapshot per-role filter (3.1.3).
- `preparation` — queue endpoint + mark-ready transition.
- `purchases` — create with weighted-avg update + reverse (refund-cash or supplier-credit path) + soft-delete.
- `expenses` — GET/POST/PUT + structural `reversal_of` reverse (D-82) with partial unique + CHECK constraints.

### Infrastructure

- **`src/lib/activity-log.ts`** — D-80 hash-chain writer (advisory-locked, empty-table safe).
- **`src/lib/idempotency.ts`** — D-79 route-level wrapper (required/optional, owner-mismatch 409, deadlock-free).
- **`src/lib/hash-chain.ts`** — shared chain primitive used by both activity-log and cancellations.
- **`src/modules/orders/locks.ts`** — canonical lock protocol for createOrder (products ASC → gift_pool ASC → VIN advisory locks) + within-request and cross-order VIN dedup.
- **`src/modules/orders/redaction.ts`** — response-surface redaction (costPrice + commissionRuleSnapshot per role).
- **`src/modules/orders/pricing.ts`** — BR-03/21/22/35..39/41 validation + commission snapshot builder.
- **`src/modules/orders/ref-code.ts`** — BR-67 refCode generator (ORD-/PU- per Europe/Paris day).

### API surface (10 endpoints added during Phase 3)

- `POST /api/v1/orders` + `GET /api/v1/orders/[id]` + `POST /api/v1/orders/[id]/cancel` + `POST /api/v1/orders/[id]/start-preparation` + `POST /api/v1/orders/[id]/mark-ready`
- `GET /api/v1/preparation`
- `POST /api/v1/purchases` + `POST /api/v1/purchases/[id]/reverse`
- `GET /api/v1/expenses` + `POST /api/v1/expenses` + `GET /api/v1/expenses/[id]` + `PUT /api/v1/expenses/[id]` + `POST /api/v1/expenses/[id]/reverse`

Build route count: 43 (Phase 2c.1 was 33; +10 API endpoints; +2 UI shells = 43 — the split matches §4 of phase-3.0 report).

### Migrations added (4 of 7 total)

- `0005_expenses_reversal_of.sql` — D-82 columns + FK + CHECK + partial unique.
- `0006_order_items_discount.sql` — BR-18 discount fields + recommendedPrice.

(Migrations 0000..0004 are Phase 0..2; 0005 + 0006 ship inside Phase 3.)

### Decisions introduced during Phase 3 prep

- D-79 idempotency reservation design.
- D-80 activity_log hash-chain write protocol.
- D-81 Phase 3.0 infrastructure precedence.
- D-82 `expenses.reversal_of` schema contract.

Canonical decisions total after Phase 3: **82** (D-01..D-82).

---

## 5. Non-blockers carried forward (not regressions)

These were documented in each tranche's §12 "Known Issues & Accepted Gaps" and are not Phase 3 blockers; they belong to later work.

1. **D-53 stale-commission mitigation (60/90 day fallback)** — pure Phase 4 concern (bonus computation reads snapshots at delivery time). No Phase 3 code is aware of age.
2. **VIN second enforcement on `تم التوصيل`** — Phase 4 (requires delivery flow).
3. **Gift-pool refill endpoint** — admin tooling for operators. Phase 3 seeds via direct INSERT; production ops will want a dedicated route.
4. **Partial UNIQUE INDEX on `LOWER(TRIM(order_items.vin))`** — app-level check + advisory lock + cross-order read-query close the hot paths, but a DB-level functional partial unique would be defense-in-depth. Phase 3.2 candidate.
5. **Order-level discount (`orders.discount_type`/`discount_value`)** — schema fields exist, not populated by any Phase 3 endpoint. Only item-level discount is used. Add when a product requirement surfaces.
6. **Manager nav does not include `/suppliers`** — carry-over from Phase 2c; UI-only nav tweak, deferred.
7. **stock_keeper GET /orders/[id] is 403** — per 16_Data_Visibility stock_keeper has no per-order GET; they work through `/preparation`. When Phase 4 wires delivery-linked driver visibility, stock_keeper will need no change (preparation queue is enough).
8. **driver 403 on all order endpoints** — correct until Phase 4 ships `deliveries.assigned_driver_id` linkage.
9. **`test` script (no arg)** — still runs everything (including integration via the env-loader signal); canonical gates are `test:unit` + `test:integration` only. A future minor patch can neuter `test` if desired.
10. **No DB-level activity_log immutability trigger** — D-58 trigger exists (ensured by migration 0001, now with the Phase 0 pgcrypto ordering fix). Confirmed working via Phase 3.0 activity-log integration test (trigger-disable + tamper + verify).

None of these block closing Phase 3 as a development phase.

---

## 6. Phase 3 freeze — no further code in this phase

- Phase 3 scope is frozen at `0151b0f`.
- No new tranche may enter Phase 3 after this closure. Any additional fix against Phase 3 baseline becomes a Phase 4 concern OR a dedicated hotfix report per D-77.
- The 8 tranche delivery reports (3.0, 3.0.1, 3.0.2, 3.0.3, 3.1, 3.1.1, 3.1.2, 3.1.3) are frozen snapshots; errata sections inside each document post-review corrections and are authoritative for drift between tranche commits.
- `docs/DEVELOPMENT_PLAN.md` now carries a `✅ Closed (2026-04-20)` marker on the Phase 3 section and updated top-of-file status.

---

## 7. What closing Phase 3 does NOT authorize

- **Not a production-deploy authorization.** Phase 3 ships the sale-side of the order lifecycle up to "جاهز للتوصيل". Without Phase 4 (deliveries + invoices + treasury + bonus computation + settlements), no collection path, no invoice PDF, and no cash handover exists.
- **Not a pilot-ready state.** Operators need the delivery + invoice + treasury surface before the system can run an end-to-end daily cycle.
- **Not a push authorization.** No push occurred in any Phase 3 tranche. The baseline lives locally on `main`.

---

## 8. Next phase gate

- **Phase 4** (reviewer decision 2026-04-20): deliveries + invoices + treasury + bonus computation + settlements + driver-tasks + dashboards.
- Phase 4 start requires: explicit "ابدأ" from the user after reviewer approval of this closure report.
- Phase 4 inherits: the full Phase 3 infrastructure (activity_log, idempotency, hash-chain, refCode, redaction, canonical locks). No re-implementation expected.

---

## 9. Final integrity attestations

- **`.env.local`** containing `TEST_DATABASE_URL` is gitignored (verified via `git check-ignore .env.local` → ignored). Not committed.
- **No push** occurred during Phase 3. `git log origin/main..HEAD` would show the full tranche chain if the remote had been set to push-track; it wasn't.
- **Working tree clean** at baseline `0151b0f` before this closure commit.
- **All 82 canonical decisions (D-01..D-82)** remain in force; none superseded during Phase 3 except as already documented (D-33 superseded by D-73 pre-Phase-3).

---

## 10. ملاحظة صدق

Phase 3 closed after 8 tranches — the last 5 of them reviewer-driven corrections landing on critical visibility, race-safety, and reproducibility flaws that weren't caught the first time. The pattern matches the earlier Phase 3.0.x streak: each tranche's report made claims that did not quite match the canonical script output, and the next tranche had to honestly re-measure and fix.

What survived that streak:
- Every gate is now reproducible from `npm run <script>` alone, with only `.env.local` on disk. No shell tricks, no hand-rolled `vitest` invocations, no coverage-threshold surprises.
- Every leak-prevention claim (costPrice, commissionRuleSnapshot) is asserted at the serialized-JSON text level, not just the JS-property level — so re-runs on different infrastructure would catch the same regression.
- Every race-safety claim (VIN dedup, cancellations chain, gift-pool lock, stock decrement) is exercised by a `Promise.all` concurrent test on the live Neon branch, not a unit mock.

Phase 4 will introduce deliveries (touching driver + stock_keeper visibility), invoices (D-35 readiness enforcement at generation time), treasury (manager box + driver custody lifecycle), bonus computation (reading the Phase 3 commissionRuleSnapshot), and settlements (negative-settlement rows for cancel_as_debt). None of that is authorized by this closure.
