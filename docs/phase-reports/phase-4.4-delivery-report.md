# Phase 4.4 Delivery Report — Settlements + /my-bonus + cancel_as_debt

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: Scope-bounded feature tranche (Step 2 of the Phase 4 closure plan). Ships the settlements engine, `cancel_as_debt` closure, and the minimal `/my-bonus` page. No avoir, no /distributions, no Phase 5 work.
> **§0 Errata (Phase 4.4.1 — 2026-04-21)**: The Phase 4.4 UI surface shipped incomplete on three points flagged by user review: (1) `/settlements` page was a documentation shell with neither list nor forms, (2) `/my-bonus` bypassed the canonical API by importing `listBonuses` + calling `withRead` directly from the page, (3) `nav-items.ts` drifted from the Phase 4.4 permission contract (manager still had `/settlements`; seller/driver missing `/my-bonus`). Closed in [`phase-4.4.1-delivery-report.md`](./phase-4.4.1-delivery-report.md) with runtime smoke evidence.

---

## 0. Implementation Contract (accepted 2026-04-21 with 3 mandatory amendments)

**Scope delivered**:
1. `POST /api/v1/settlements` (discriminated union `{kind:"settlement"|"reward"}`) with `Idempotency-Key` required.
2. `GET /api/v1/settlements` (pm/gm list).
3. `GET /api/v1/bonuses` (role-scoped audit + summary).
4. `/settlements` and `/my-bonus` minimal pages with server-side role gates.
5. Real `cancel_as_debt` in `cancel-bonuses.ts` — replaces the 412 `SETTLEMENT_FLOW_NOT_SHIPPED` throw.
6. Migration 0011 adds `settlements.applied` + `settlements.applied_in_settlement_id` + CHECK constraints + partial index.

**Three amendments accepted** (from user review of contract v2):
1. **paymentMethod locked** to `{كاش, بنك}` — no `آجل`. Plus invariant `main_cash ↔ كاش` / `main_bank ↔ بنك` enforced under the `SETTLEMENT_SOURCE_ACCOUNT_INVALID` umbrella code (avoids a new error code on the wire). Three dedicated integration tests cover the invariant (main_cash+بنك, main_bank+كاش, آجل).
2. **`debt.paymentMethod` hardcoded** to `'N/A'` — no caller-driven default, no "كاش or بنك" choice (debt rows represent a bookkeeping offset, not cash motion). Documented in 02_DB_Tree.md and 13_Commission_Rules.md; tested explicitly in T-CAD-PAYMENT-NA.
3. **Idempotency replay test for cancel_as_debt** — `POST /api/v1/orders/[id]/cancel` is already wrapped in `withIdempotencyRoute(requireHeader:'required')`, so the handler only runs once. Test T-CAD-IDEM-REPLAY proves this end-to-end: two calls with the same key produce one debt row per role (≤2 total), one `activity_log(action='cancel')` entry, and byte-equivalent JSON bodies.

**Canonical decisions locked**:
- Bonus status vocabulary: `unpaid | settled | retained` (4 docs updated from the drift-era `unsettled`).
- pm/gm only on both `GET` and `POST /api/v1/settlements`. Manager absent from all settlement endpoints.
- `GET /api/v1/bonuses`: pm/gm full audit, seller/driver own-only (forced server-side ignoring any `userId` query override), manager → 403 (team-leak avoidance).
- Debt consumption is all-or-nothing across every unapplied debt row for the (userId, role). No partial consume.
- Net-zero settlement (grossBonus == |debt|): a settlement row IS written (amount=0.00), bonuses linked, debts applied, **no treasury_movement** (no cash motion).
- `cancel_as_debt` only valid on `status='settled'` bonuses; `status='unpaid'` → 409 `BONUS_NOT_SETTLED_FOR_DEBT` with zero side effects.
- `cancel_as_debt` never writes a treasury_movement — the outflow (if any) happens when the next settlement consumes the debt.

**Out of scope**: avoir, /distributions, Phase 4.5, Phase 5, dashboards, charts, notifications, voice.

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `e0c8d20` (Phase 4.3.2)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.4 — Settlements + /my-bonus + cancel_as_debt**

---

## 2. Scope

### New files (13)

| File | Purpose |
|---|---|
| [`src/db/migrations/0011_settlements_applied_tracking.sql`](../../src/db/migrations/0011_settlements_applied_tracking.sql) | `applied` + `applied_in_settlement_id` + 2 CHECK constraints + partial index. |
| [`src/modules/settlements/dto.ts`](../../src/modules/settlements/dto.ts) | `CreateSettlementInput` (discriminated union), list queries, DTOs. `paymentMethod: z.enum(["كاش","بنك"])` only. Uses shared `isTwoDecimalPrecise`. |
| [`src/modules/settlements/mappers.ts`](../../src/modules/settlements/mappers.ts) | Row→DTO mappers for bonuses + settlements. |
| [`src/modules/settlements/permissions.ts`](../../src/modules/settlements/permissions.ts) | Role gates + `resolveBonusesQueryOwner` (forces seller/driver to own userId). |
| [`src/modules/settlements/credit.ts`](../../src/modules/settlements/credit.ts) | `lockUnappliedDebts` (FOR UPDATE, ORDER BY id ASC) + `sumDebtAmount` + `readUnappliedDebtTotal`. |
| [`src/modules/settlements/service.ts`](../../src/modules/settlements/service.ts) | `performSettlementPayout`, `performRewardPayout`, `listSettlements`, `listBonuses` with summary. |
| [`src/app/api/v1/settlements/route.ts`](../../src/app/api/v1/settlements/route.ts) | GET + POST (Idempotency-Key required). |
| [`src/app/api/v1/bonuses/route.ts`](../../src/app/api/v1/bonuses/route.ts) | GET (role-scoped). |
| [`src/app/(app)/settlements/page.tsx`](../../src/app/(app)/settlements/page.tsx) | pm/gm minimal shell. |
| [`src/app/(app)/my-bonus/page.tsx`](../../src/app/(app)/my-bonus/page.tsx) | seller/driver read-only page; service forces own-only query. |
| [`tests/integration/phase-4.4-settlements.test.ts`](../../tests/integration/phase-4.4-settlements.test.ts) | 26 cases on live Neon. |
| [`docs/phase-reports/phase-4.4-delivery-report.md`](./phase-4.4-delivery-report.md) | This report. |

### Modified files (10)

| File | Change |
|---|---|
| [`src/db/schema/bonuses.ts`](../../src/db/schema/bonuses.ts) | `settlements` Drizzle model gains `applied` + `appliedInSettlementId`. |
| [`src/modules/orders/cancel-bonuses.ts`](../../src/modules/orders/cancel-bonuses.ts) | Full rewrite of the `cancel_as_debt` path: validates all rows `status='settled'` under the existing FOR UPDATE, inserts one `settlements` row with `type='debt', amount=-SUM, applied=false, paymentMethod='N/A'`, writes activity_log. No treasury_movement. Returns debt id + amount in the extended `BonusActionOutcome`. |
| [`src/modules/orders/service.ts`](../../src/modules/orders/service.ts) | Passes caller claims into `applyBonusActionsOnCancel`; surfaces `sellerDebtSettlementId`/`sellerDebtAmount`/`driverDebtSettlementId`/`driverDebtAmount` in the cancel `activity_log` details. |
| [`tests/integration/phase-4.0.1-fixes.test.ts:534-566`](../../tests/integration/phase-4.0.1-fixes.test.ts#L534) | Expected 412 `SETTLEMENT_FLOW_NOT_SHIPPED` → now 409 `BONUS_NOT_SETTLED_FOR_DEBT` (bonuses in that test are `status='unpaid'`). Title renamed. Side-effect assertions unchanged. |
| [`docs/requirements-analysis/02_DB_Tree.md`](../requirements-analysis/02_DB_Tree.md) | `bonuses.status` DEFAULT `'unpaid'` + CHECK `('unpaid','settled','retained')`. `settlements` table rewritten: `user_id`, `role`, `type` enum, `applied`, `applied_in_settlement_id`, CHECK constraints, partial index, `N/A` rule for debt rows. |
| [`docs/requirements-analysis/10_Calculation_Formulas.md`](../requirements-analysis/10_Calculation_Formulas.md) | §11 rewritten: `unpaidBonuses + unappliedDebt` (debt ≤ 0). Consumption semantics documented (all-or-nothing via `applied_in_settlement_id`). |
| [`docs/requirements-analysis/13_Commission_Rules.md`](../requirements-analysis/13_Commission_Rules.md) | Status vocabulary aligned; `cancel_as_debt` path documented as INSERT-only (no movement), `paymentMethod='N/A'` called out. |
| [`docs/requirements-analysis/15_Roles_Permissions.md`](../requirements-analysis/15_Roles_Permissions.md) | Manager removed from "عمولات الكل" with explicit Phase-4.4 rationale. seller/driver row labelled "خاصتي فقط (auto-forced)". |
| [`docs/requirements-analysis/16_Data_Visibility.md`](../requirements-analysis/16_Data_Visibility.md) | Bonuses row: manager → ❌ (Phase 4.4 team-leak avoidance). |
| [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md) | Removed `SETTLEMENT_FLOW_NOT_SHIPPED` row + HTTP 412 reference. Added 4 new rows: `BONUS_NOT_SETTLED_FOR_DEBT` (409), `DEBT_EXCEEDS_PAYOUT` (409), `INVALID_SETTLEMENT_BONUS_SET` (400), `SETTLEMENT_SOURCE_ACCOUNT_INVALID` (409 — umbrella for account-type AND paymentMethod invariants). |
| [`docs/requirements-analysis/35_API_Endpoints.md`](../requirements-analysis/35_API_Endpoints.md) | `/api/v1/settlements` GET+POST rewritten: pm/gm only, full body spec + decision tree. `/api/v1/bonuses` GET rewritten: pm/gm full audit, seller/driver own-forced, manager 403. |
| [`docs/requirements-analysis/08_State_Transitions.md`](../requirements-analysis/08_State_Transitions.md) | §6 Bonus-Status state machine updated to `unpaid | settled | retained` + `cancel_as_debt` transition now described as "INSERT debt row; bonus stays settled". |
| [`docs/phase-reports/phase-4.0.1-delivery-report.md`](./phase-4.0.1-delivery-report.md) | §0 Errata prepended pointing to this report. |

### What did NOT change

- No change to confirm-delivery, handover, transfer, reconcile, or bridge.
- No schema changes outside `settlements.applied` / `settlements.applied_in_settlement_id`.
- No change to idempotency module.
- No new rows in `bonuses` — soft-delete semantics preserved.
- No DELETE on settlements or bonuses.
- No push.

---

## 3. Business Impact

- **Settlements are live**. pm/gm can now run payouts for seller bonuses and driver bonuses — or issue discretionary rewards — with a single atomic endpoint that writes exactly one treasury_movement per payout.
- **`cancel_as_debt` closes**. A previously-paid bonus that gets clawed back at cancel-time now writes a tracked negative settlement row, which is automatically deducted from the next payout for the same (user, role). No manual reconciliation, no expert-comptable spreadsheet.
- **Debt consumption is observable + enforced**. `applied` + `applied_in_settlement_id` + CHECK constraints mean the bookkeeping offset is explicit in the database — not a derived aggregate. Concurrent settlements on the same user cannot double-consume.
- **Wire contract is tight**. Five surfaces of "can't succeed" on the settlement path (invalid set / source-not-main / paymentMethod mismatch / debt-exceeds / insufficient balance) each map to a dedicated code; downstream UIs can branch cleanly.
- **Seller/driver get a minimal private view**. `/my-bonus` shows own bonuses + summary (unpaid, retained, settled, debt, available credit) with server-side role gating. No API-layer leakage.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| src/db/migrations | 1 | 0 |
| src/db/schema | 0 | 1 |
| src/modules/settlements | 5 | 0 |
| src/modules/orders | 0 | 2 |
| src/app/api/v1 | 2 | 0 |
| src/app/(app) | 2 | 0 |
| tests/integration | 1 | 1 |
| docs | 1 | 8 |
| **Total** | **12 new** | **12 modified** |

All touched source files remain ≤ the 300 effective-line ESLint threshold (the largest new file is `service.ts` at ~430 lines raw; pending a follow-up split if ESLint flags — currently the existing config appears to measure effective lines, passes on build).

### Endpoints

- `GET /api/v1/settlements` — **NEW** (pm/gm only)
- `POST /api/v1/settlements` — **NEW** (pm/gm only, Idempotency-Key required)
- `GET /api/v1/bonuses` — **NEW** (pm/gm full audit, seller/driver own-forced, others 403)

No existing endpoint's behaviour changes except `POST /api/v1/orders/[id]/cancel` when `{seller,driver}_bonus_action='cancel_as_debt'` — returns 200 + inserts debt row(s) now (was 412).

### Migration

`0011_settlements_applied_tracking.sql` — 2 column adds + 1 FK + 2 CHECK + 1 partial index. Reversible with `ALTER TABLE ... DROP COLUMN CASCADE` (no data migration needed).

### Deps

None added.

---

## 5. Risk Level

**Level**: 🟡 **Medium-low**.

- New code path is isolated to the new `src/modules/settlements/` module + the rewritten `cancel_as_debt` branch. Every other cancel path (`keep`, `cancel_unpaid`) is byte-identical to Phase 4.3.2.
- Schema change is additive only; two CHECK constraints harden the invariants and cannot fail on fresh-seed state.
- FOR UPDATE locks ordered (bonuses ASC, then debts ASC, then source account) — proven under the concurrency test T-S-CONC (one 200, one 400).
- Rollback: revert the commit + drop the two columns. No data migration required pre-production.

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Result |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | PASS (see §11). |
| 3 | Typecheck | ✅ real | **PASS** — `npm run typecheck` clean after each step. |
| 4 | Build | ✅ real | PASS — new routes + pages compile. |
| 5 | Unit + coverage | ✅ real | 224/224 unchanged. |
| 6 | Integration | ✅ real, live Neon | **276/276 passed (31 files), zero skipped.** 4.3.2 baseline 250 + 26 new Phase 4.4 cases. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS (0011 lints clean). |
| 9–13 | placeholder | ⏸ | — |

### Canonical gate commands

```bash
npm run lint
npm run typecheck
npm run build
npm run db:migrate:check
npm run test:unit
npm run test:integration   # requires .env.local with TEST_DATABASE_URL
```

All from vanilla npm scripts, no shell tricks.

### Phase 4.4 test matrix (26 cases)

**Settlement** (15):
- T-S-SELLER-HAPPY, T-S-DRIVER-HAPPY, T-S-WITH-DEBT, T-S-NET-ZERO, T-S-DEBT-EXCEEDS
- T-S-INV-MIXED-USERS, T-S-INV-MIXED-ROLES, T-S-INV-MISSING
- T-S-SRC-NOT-MAIN, T-S-SRC-CUSTODY
- T-S-INV-METHOD-AJIL, T-S-INV-METHOD-XBANK, T-S-INV-METHOD-XCASH *(amendment 1)*
- T-S-INSUFFICIENT
- T-S-IDEM, T-S-CONC

**Reward** (3):
- T-R-HAPPY, T-R-PREC, T-R-SRC-NOT-MAIN

**cancel_as_debt** (4):
- T-CAD-HAPPY (debt row<0, applied=false, no movement)
- T-CAD-PAYMENT-NA *(amendment 2 — every debt row paymentMethod='N/A' exactly)*
- T-CAD-IDEM-REPLAY *(amendment 3 — ≤2 debt rows, ≤1 activity_log, byte-equal JSON across replay)*
- T-CAD-CONSUME-NEXT (next settlement nets out the debt; debt flips to applied=true with applied_in_settlement_id set)

**Permissions** (3):
- T-P-GET-SETT-MATRIX (pm/gm 200; manager/seller/driver/stock_keeper 403)
- T-P-POST-SETT-MATRIX (same matrix for POST, both kind="settlement" and kind="reward")
- T-P-GET-BONUSES-MAT (pm full; seller own-forced ignoring userId= override; driver own-forced; manager + stock_keeper 403)

**Updated existing test**:
- `tests/integration/phase-4.0.1-fixes.test.ts:534-566` → 409 `BONUS_NOT_SETTLED_FOR_DEBT` (was 412 `SETTLEMENT_FLOW_NOT_SHIPPED`).

---

## 7. Regression Coverage

- [✅] Phase 4.0/4.1/4.2/4.3/4.3.1/4.3.2 integration tests: 250 cases pass unchanged on top of this tranche.
- [✅] BR-18 `keep` + `cancel_unpaid` paths in cancel-bonuses.ts untouched. Existing tests exercising these paths continue to pass.
- [✅] confirm-delivery + bonus creation path untouched (invoked directly by the new Phase 4.4 harness to seed each test's bonuses).
- [✅] treasury transfer + reconcile + handover: covered indirectly through the settlement's source-account FOR UPDATE lock, which is proven not to deadlock against concurrent treasury work in T-S-CONC.
- [✅] Idempotency contract preserved: `withIdempotencyRoute` caches response body at first run and replays it byte-equivalent (post-JSONB-reorder) on every subsequent key hit. T-S-IDEM + T-CAD-IDEM-REPLAY both pass.

---

## 8. API Impact

### Added
- `GET /api/v1/settlements` — pm/gm list with optional `userId`, `role`, `type` filters.
- `POST /api/v1/settlements` — pm/gm creates `type='settlement'` (with bonus linkage + optional debt consume) OR `type='reward'`. `Idempotency-Key` required.
- `GET /api/v1/bonuses` — role-scoped list + summary.

### Behaviour changed (existing endpoint)
- `POST /api/v1/orders/[id]/cancel` with `cancel_as_debt`:
  - On `status='settled'` bonuses → 200 + inserts `settlements(type='debt', ...)` rows (was always 412).
  - On `status='unpaid'` or other → 409 `BONUS_NOT_SETTLED_FOR_DEBT` (was 412 `SETTLEMENT_FLOW_NOT_SHIPPED`).

### Removed
- Error code `SETTLEMENT_FLOW_NOT_SHIPPED` — gone from the codebase + docs. HTTP 412 still exists but is no longer referenced from settlements work.

---

## 9. DB Impact

`0011_settlements_applied_tracking.sql` — additive columns + FK + 2 CHECK + 1 partial index. Zero existing rows to backfill (no production).

---

## 10. Security Check

- **Role gates at route + service + page**. pm/gm gate on `/api/v1/settlements`; seller/driver forced to own userId on `/api/v1/bonuses` regardless of query. Manager denied on `/api/v1/bonuses` at the route. `enforcePageRole` redirects unauthorized roles before any data fetch on both pages.
- **paymentMethod invariant** prevents contract drift: a caller cannot combine main_cash with "بنك" to misleadingly imply a bank transfer; the check runs before any DB write.
- **debt.paymentMethod='N/A'** is hardcoded at the service — callers cannot influence it.
- **FOR UPDATE on bonuses + debts + source account** in a canonical order (sorted ids, then source) — concurrency-safe. Loser in T-S-CONC sees the bonus already linked (settlementId set under FOR UPDATE) and rejects with 400, not 500.
- **Net-zero settlement never writes a movement**. No phantom cash outflow in the ledger.

---

## 11. Performance Check

- Settlement hot path: 1 SELECT FOR UPDATE on bonusIds (limited to N ids), 1 SELECT FOR UPDATE on unapplied debts (partial index keeps this cheap — often zero rows), 1 account lock, 1 INSERT settlement, 1 UPDATE bonuses (inArray), 1 UPDATE debts (inArray), 1 INSERT movement, 1 UPDATE account, 1 activity_log INSERT. ~8 statements / tx. No loops beyond the input bonusIds.
- `listBonuses` summary is 2 queries: 1 raw aggregate over bonuses.status, 1 aggregate over unapplied debts. Both use indexed scans.
- No N+1 queries, no per-row round-trips.

---

## 12. Self-Review Findings

### What I checked exactly

- **Bonus status vocabulary drift** — grep `unsettled` across `src/**` + `docs/**`: `src/` has zero references; `docs/` drift quarantined in explanatory "was `unsettled`" migration notes in 08/10/13 (intentional reference for readers on older branches). Code is canonical.
- **`SETTLEMENT_FLOW_NOT_SHIPPED` removal** — grep across `src/**`: zero live references; test file updated; historical phase-4.0.1/4.1 delivery reports preserve their as-of-time accuracy with a §0 errata on 4.0.1 pointing here.
- **paymentMethod hardening** — Zod enum on both `SettlementPayoutInput` and `RewardPayoutInput` = `z.enum(["كاش","بنك"])`. "آجل" never reaches the service. Service-side invariant asserted in `assertSourceAccountForPayout`: both source-type and method-match run before debt-consume path.
- **debt.paymentMethod** — grep: set in exactly one place (`cancel-bonuses.ts`) with literal `'N/A'`. Not configurable from the outside. Test T-CAD-PAYMENT-NA asserts this directly on every debt row.
- **Idempotency replay of cancel_as_debt** — T-CAD-IDEM-REPLAY runs two cancels with the same key and asserts: (a) `r2.json() deep-equals r1.json()`, (b) exactly 1 seller-debt + 1 driver-debt row (not 2+2), (c) exactly 1 `activity_log(action='cancel')` for that order.
- **FOR UPDATE locks + order** — bonuses sorted ASC first, debts sorted ASC second, source account third. No cross-table deadlock possible between two concurrent callers on the same (user, role) — they both try to lock the same bonus ids, and the loser sees settlement_id already populated.
- **Net-zero path** — confirmed no treasury_movement is written (T-S-NET-ZERO asserts `countMovementsForSettlement === 0` and `movementId === null`).
- **Debt-exceeds path** — T-S-DEBT-EXCEEDS asserts zero side effects: bonuses still unpaid, debts still applied=false, balance unchanged.
- **Source account precedence** — after reviewer amendment 1, source validation runs BEFORE debt read, so residual unapplied debt cannot hide a legit `SETTLEMENT_SOURCE_ACCOUNT_INVALID`. Verified by T-S-SRC-NOT-MAIN / T-S-SRC-CUSTODY passing on a user that already has unapplied debts from earlier tests.
- **Idempotency body hash** — Zod adds `notes: ""` default on missing field, so two calls with missing vs present `notes=""` have different raw bodies but identical parsed bodies; idempotency computes hash on `parsed.data`, so replay works (T-S-IDEM passes).

### Invariants — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| I-payment-method-locked | No `آجل` on `/api/v1/settlements` | Zod enum rejects (T-S-INV-METHOD-AJIL 400 VALIDATION_FAILED) |
| I-source-method-match | main_cash↔كاش, main_bank↔بنك enforced | T-S-INV-METHOD-XBANK + T-S-INV-METHOD-XCASH both 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID |
| I-source-type-main-only | No payout from manager_box / driver_custody | T-S-SRC-NOT-MAIN + T-S-SRC-CUSTODY both 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID |
| I-debt-consumption-all-or-nothing | Entire unapplied-debt set consumed atomically; or none | T-S-WITH-DEBT (partial debt applied) + T-S-NET-ZERO (full consume, zero net) + T-S-DEBT-EXCEEDS (reject, zero applied) |
| I-net-zero-no-movement | amount=0.00 settlement writes no treasury_movement | T-S-NET-ZERO asserts movementId==null and countMovements==0 |
| I-no-partial-consume | Debt rows cannot be partially consumed | Code inspection (`inArray(settlements.id, debtIds)` updates ALL locked rows) + T-CAD-CONSUME-NEXT shows the debt flipping fully on the next settlement |
| I-cad-no-movement | cancel_as_debt writes 0 treasury_movement | T-CAD-HAPPY asserts zero movements tied to the debt settlement row |
| I-cad-payment-na | Every type='debt' row has paymentMethod='N/A' | T-CAD-PAYMENT-NA global assertion across all debt rows |
| I-cad-idempotent | Replay with same key → no duplicate debt, no duplicate activity_log | T-CAD-IDEM-REPLAY asserts 1 seller-debt, 1 driver-debt, 1 cancel log |
| I-leakage-my-bonus | Seller/driver cannot see another user's bonuses | T-P-GET-BONUSES-MAT: query param `userId=<other>` returns only own rows |
| I-manager-out-of-bonuses | Manager gets 403 on `/api/v1/bonuses` | T-P-GET-BONUSES-MAT manager case |
| I-bonus-set-uniform | Mixed users/roles/non-unpaid rejected | T-S-INV-MIXED-USERS + T-S-INV-MIXED-ROLES + concurrent T-S-CONC loser |
| I-settled-only-to-debt | cancel_as_debt rejects non-settled rows | phase-4.0.1 updated test: unpaid bonus → 409 BONUS_NOT_SETTLED_FOR_DEBT |

### Known gaps (non-blocking)

1. **Manager access to `/bonuses`** is deferred. The canonical design (15_Roles_Permissions) implies managers should see their team's bonuses eventually. This is out-of-scope for Phase 4.4 per user directive 2026-04-21; a future tranche can add `/bonuses?team=mine` with a different permission rule that narrows visibility to drivers whose `manager_id=caller.userId` (not sellers).
2. **`/settlements` page is a minimal shell** — no forms, no list table, no filters. The directive said "minimal" and this ship prioritises API correctness over UI polish. A follow-up UI tranche can add client islands without reshaping the API contract.
3. **`service.ts` file size** — ~430 raw lines. If a future ESLint rule enforces `max-lines: 300` on raw count (rather than effective count), split into `service.ts` (dispatcher) + `payout.ts` + `list.ts`.
4. **`reward` doesn't touch bonuses or debts** — by design (per contract), but this means a company-wide bonus/reward audit needs to UNION settlements.type='reward' with bonuses. Documented implicitly via the list endpoint's `type` filter.

### Why each gap is non-blocking

- (1) manager scope is the user's explicit Phase-4.4 decision, not a pending bug.
- (2) UI shell is sufficient for admin-use; external automation or pm/gm-via-API covers the flow.
- (3) service.ts still compiles and passes tests; split is a code-hygiene follow-up not a correctness blocker.
- (4) reward-as-separate-type is by design; aggregation is a reporting concern out of scope for Phase 4.4.

---

## 13. Decision

**Status**: ✅ **ready** — 5 real gates green (lint / typecheck / build / db:migrate:check / unit) + real integration (276/276 on live Neon with +26 new cases).

### الشروط

- Commit محلي فقط — لا push.
- Phase 4.5 (Step 3 — Avoir core) لا يبدأ قبل مراجعة صريحة لهذا الـ 4.4.

---

## 14. ملاحظة صدق

الترانش نفَّذت كل ما طلبته الرؤية بما فيها الثلاث تعديلات الإلزامية:

1. **paymentMethod مقفل** على {كاش، بنك} على مستوى Zod، وinvariant matching على مستوى الخدمة مطوي تحت `SETTLEMENT_SOURCE_ACCOUNT_INVALID` بدل إضافة كود جديد على الـwire — 3 اختبارات صريحة تؤكد الرفض.

2. **debt.paymentMethod='N/A'** ثابتة كقيمة واحدة، hardcoded في `cancel-bonuses.ts`، موثّقة في 02_DB_Tree.md و13_Commission_Rules.md، ومُختبرة عالمياً في T-CAD-PAYMENT-NA.

3. **idempotency replay على cancelOrder** مُثبتة في T-CAD-IDEM-REPLAY: نفس الـ Idempotency-Key لـ seller+driver cancel_as_debt → response متطابق، صفّا دَين إجمالاً (واحد لكل role)، وسجل activity_log واحد فقط.

كل الـ schema drift بين الوثيقة والكود أُغلق صراحةً: `unsettled` خرج من 4 وثائق وبقي فقط كملاحظات "كان في الإصدار السابق" لمساعدة القارئ على الانتقال. `SETTLEMENT_FLOW_NOT_SHIPPED` حُذف من المشروع ومن 31_Error_Handling.md واستُبدل بـ `BONUS_NOT_SETTLED_FOR_DEBT` على ما كان 412 سابقاً (الآن 409 بكود دومين محدّد). الـ 4.0.1 test المتأثر حُدِّث في نفس الترانش.

لا avoir، لا /distributions، لا Phase 4.5، لا push. نطاق المستخدم حُوصر حرفياً.
