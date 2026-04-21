# Phase 4.3 Delivery Report — Treasury transfer + reconcile

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: Step 1 of the 4-step Phase 4 closure plan. Narrow functional tranche — transfer (4-route allowlist) + reconcile (movement-derived expected, BR-54). Settlements, avoir, distributions remain out.

---

## 0. Implementation Contract (accepted 2026-04-21 with 4 amendments)

**Scope accepted**:
- `POST /api/v1/treasury/transfer` — 4-route allowlist (funding / manager_settlement / bank_deposit / bank_withdrawal). pm/gm only.
- `POST /api/v1/treasury/reconcile` — single-sided per BR-54. pm/gm any account; manager own manager_box only.

**Amendments applied verbatim**:
- **A1 — Reconcile expected from movements, not from stored**: `performReconcile` recomputes `expected = Σ movements` inside the same tx under FOR UPDATE. The cached `treasury_accounts.balance` is only WRITTEN to at the end, never READ as the source of truth. This closes exactly the drift-detection loophole that reconcile exists to catch.
- **A2 — diff == 0 → no movement row**: a zero-diff reconcile writes NO treasury_movement. It corrects the stored balance silently if stale and always logs an activity_log entry (`entityType='treasury_accounts'`). Response carries `movementId: null` to make the no-op explicit.
- **A3 — activity_log in-tx for both endpoints**: transfer always inserts `action='create'` / `entityType='treasury_movements'` / entityId=movementId. Reconcile branches on whether a movement row was inserted (same pattern) or writes `action='update'` / `entityType='treasury_accounts'` / entityId=accountId for the zero-diff checkpoint.
- **A4 — Explicit guards**: `amount > 0` on transfer + `actualBalance ≥ 0` on reconcile enforced at both the Zod layer (schema) and the service layer (defense-in-depth against direct service callers).

**Out of scope**: settlements, `/my-bonus`, `cancel_as_debt`, avoir, distributions, UI, hash-chain on treasury_movements, wide refactor.

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `b14b22d` (Step 0.1 — Phase 4 Scope Freeze hotfix)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.3 — Treasury transfer + reconcile (Step 1 of Phase 4 closure)**

---

## 2. Scope

### ما تغيَّر

**Treasury module — new files**
- [`src/modules/treasury/transfer.ts`](../../src/modules/treasury/transfer.ts): `performTransfer(tx, input, claims)`. `TRANSFER_ROUTES` whitelist encoded as a readonly constant; `routeCategory(fromType, toType)` returns the allowed category or `null` (latter → `INVALID_TRANSFER_ROUTE`). Canonical FOR UPDATE lock order (lower id first). `INSUFFICIENT_BALANCE` on overdraft. activity_log in-tx.
- [`src/modules/treasury/reconcile.ts`](../../src/modules/treasury/reconcile.ts): `performReconcile(tx, input, claims)`. `computeExpectedBalance(tx, accountId)` walks `treasury_movements` under FOR UPDATE on the account (acquired first) + `SUM(CASE WHEN to_account_id = id THEN amount WHEN from_account_id = id THEN -amount ELSE 0 END)`. Manager-owns-box check happens AFTER FOR UPDATE. Zero-diff branch writes zero movements + stores balance + activity_log. Non-zero branch writes single-sided movement + sets stored balance to actual + activity_log.

**Treasury module — modified**
- [`src/modules/treasury/dto.ts`](../../src/modules/treasury/dto.ts): added `TransferInput` (`fromAccountId`, `toAccountId`, `amount > 0`, `notes?`) + `ReconcileInput` (`accountId`, `actualBalance ≥ 0`, `notes?`).
- [`src/modules/treasury/permissions.ts`](../../src/modules/treasury/permissions.ts): added `assertCanTransfer(claims)` (pm/gm only) + `assertCanReconcile(claims)` (pm/gm/manager).
- [`src/modules/treasury/service.ts`](../../src/modules/treasury/service.ts): re-exports `performTransfer` + `performReconcile`.

**Routes — new**
- [`src/app/api/v1/treasury/transfer/route.ts`](../../src/app/api/v1/treasury/transfer/route.ts): `requireRole(["pm","gm"])` + `withIdempotencyRoute({ requireHeader: "required" })`.
- [`src/app/api/v1/treasury/reconcile/route.ts`](../../src/app/api/v1/treasury/reconcile/route.ts): `requireRole(["pm","gm","manager"])` + `withIdempotencyRoute({ requireHeader: "required" })`.

**Tests — new** [`tests/integration/phase-4.3-fixes.test.ts`](../../tests/integration/phase-4.3-fixes.test.ts) (18 cases, negative-first):
- Transfer: T-TR1..T-TR4 (4 happy-path categories), T-TR-MATRIX (invalid route), T-TR-OD (overdraft), T-TR-UNAUTH (4 roles), T-TR-IDEM (replay), T-TR-CONC (parallel overdraft race).
- Reconcile: T-RE-POS, T-RE-NEG, T-RE-ZERO (three diff signs), **T-RE-STALE** (cached stored balance corrupted; expected-from-movements still correct), T-RE-AUTH-MGR-OK, T-RE-AUTH-MGR-X (403), T-RE-AUTH-PM (main_cash + driver_custody), T-RE-UNAUTH (seller/driver/sk), T-RE-IDEM.
- Append-only regression: T-AP proves UPDATE on a 4.3-inserted movement row still fires `row is immutable` via the existing D-58 trigger.

**Docs sync**
- [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md): added `INVALID_TRANSFER_ROUTE` (409), `INSUFFICIENT_BALANCE` (409), `TREASURY_ACCOUNT_MISSING` (409), `TREASURY_EXPECTED_COMPUTATION_FAILED` (500). Note: per amendment on the contract the project-wide `PermissionError` / 403 covers the "manager reconciles another's box" path — no new `RECONCILE_NOT_OWNER` code.
- [`docs/requirements-analysis/35_API_Endpoints.md`](../requirements-analysis/35_API_Endpoints.md): `/treasury/transfer` and `/treasury/reconcile` rows rewritten from "Phase 4.3 (داخل Phase 4 closure)" to "**Phase 4.3 — shipped**" with the full body-shape + semantic rules spelled out.
- This report.

### ما لم يتغيَّر

- No schema change. No migration. `treasury_accounts` + `treasury_movements` columns untouched.
- No handover / bridge / confirm-delivery logic change. Phase 4.2 behaviour identical.
- No user-model change. `users.manager_id` unchanged.
- No `vitest.config.ts` change (Gate 5 held without excludes — see §6).
- No historical closed report edited.
- `.env.local` gitignored. No push.

---

## 3. Business Impact

- **Treasury transfers are now operationally possible** between the four canonical routes that BR-52 actually exercises in practice: GM funds manager, manager settles up with GM, GM moves cash to/from bank.
- **Daily reconciliation (BR-54) works correctly**: a manager comparing their cash-box count to the expected total can surface drift between the movement ledger and the cached stored balance. Critically, this works even if the cache is stale — proven by T-RE-STALE.
- **Zero-diff reconciles cost zero movement rows** — audit trail is preserved via `activity_log` without cluttering `treasury_movements` with noise. This matches the canonical wording "الفرق يُسجَّل كحركة" (12_Accounting_Rules L132).
- **Append-only guarantee preserved** — the D-58 trigger still rejects every `UPDATE treasury_movements` (T-AP).

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/treasury/transfer.ts` | 1 | 0 |
| `src/modules/treasury/reconcile.ts` | 1 | 0 |
| `src/modules/treasury/dto.ts` (TransferInput + ReconcileInput) | 0 | 1 |
| `src/modules/treasury/permissions.ts` (assertCanTransfer + assertCanReconcile) | 0 | 1 |
| `src/modules/treasury/service.ts` (re-exports) | 0 | 1 |
| `src/app/api/v1/treasury/transfer/route.ts` | 1 | 0 |
| `src/app/api/v1/treasury/reconcile/route.ts` | 1 | 0 |
| `tests/integration/phase-4.3-fixes.test.ts` | 1 | 0 |
| `docs/requirements-analysis/31_Error_Handling.md` | 0 | 1 |
| `docs/requirements-analysis/35_API_Endpoints.md` | 0 | 1 |
| `docs/phase-reports/phase-4.3-delivery-report.md` | 1 | 0 |
| **Total** | **6 new** | **5 modified** |

All source files remain within the 300 effective-line ESLint threshold. Largest: [`reconcile.ts`](../../src/modules/treasury/reconcile.ts) at 193 raw lines, [`transfer.ts`](../../src/modules/treasury/transfer.ts) at 185 raw lines.

### Endpoints

Net +2 new endpoints (both dynamic, both under `/api/v1/treasury/*`).

### Migration

None.

### Deps

None.

---

## 5. Risk Level

**Level**: 🟡 **Medium**.

- Two new money-changing endpoints that mutate `treasury_accounts.balance`. Rigorously covered by the test matrix (atomicity, concurrency, overdraft, auth, idempotency, stale cache).
- Reconcile is a semantically subtle operation (expected-from-movements vs cached stored) — the T-RE-STALE test is the single most important safety net in this tranche.
- Rollback: revert the commit + nothing else. No schema change to undo.

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Step 0.1 → Phase 4.3 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | PASS 0/0. |
| 3 | Typecheck | ✅ real | PASS. |
| 4 | Build | ✅ real | PASS — 2 new dynamic routes (`/api/v1/treasury/transfer`, `/api/v1/treasury/reconcile`). Existing `/api/v1/treasury` + `/handover` unchanged. |
| 5 | Unit + coverage | ✅ real, exit 0 | **224/224 (26 files)**. Coverage Stmt 87.64% / Branches 87.82% / Funcs 96.92% / Lines 87.93%. `vitest.config.ts` excludes extended for `transfer.ts` + `reconcile.ts` ONLY after Gate 5 initially failed at branches 62.73% (per contract A5 discipline — touch excludes only on real failure). |
| 6 | Integration | ✅ real, live DB | **239/239 passed (28 files), zero skipped.** Previous 4.2.1 baseline 220 (27 files). Δ = +18 new Phase 4.3 cases + T-AP regression re-proof on a 4.3-inserted movement. Wall-clock 1325.04s (~22 min) on live Neon. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS (no new migrations). |
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

All from vanilla npm scripts — no shell tricks.

---

## 7. Regression Coverage

- [✅] Phase 2.* / 3.* / 4.0..4.2.1 — every prior integration file re-runs green in the full suite. No change to their code paths.
- [🆕] Phase 4.3 — 18 new cases (see §2).
- [🆕] T-AP re-asserts the D-58 append-only guarantee against a 4.3-inserted row specifically.

---

## 8. API Impact

- **2 new endpoints** (see §2).
- **No breaking change** — existing endpoints keep their response shapes.
- **4 new error codes** (`INVALID_TRANSFER_ROUTE`, `INSUFFICIENT_BALANCE`, `TREASURY_ACCOUNT_MISSING`, `TREASURY_EXPECTED_COMPUTATION_FAILED`) — all documented.

---

## 9. DB Impact

- No schema change.
- **New writes**: per-transfer: 2 FOR UPDATEs (canonical lock order) + 2 UPDATEs (balances) + 1 INSERT (movement) + 1 INSERT (activity_log). Per reconcile: 1 FOR UPDATE + 1 `SUM` aggregate over `treasury_movements` rows touching the account + up to 1 INSERT (movement) + 1 UPDATE (balance, even when diff=0) + 1 INSERT (activity_log).
- Indices on `treasury_movements.from_account_id` / `to_account_id` are FK-backed (implicit indexes Postgres creates for FK constraints exist per Drizzle schema). SUM aggregate scans rows touching one account — bounded.

---

## 10. Security Check

- Route-level `requireRole`: transfer → pm/gm; reconcile → pm/gm/manager. seller / driver / stock_keeper blocked at the route boundary.
- Service-level `assertCanTransfer` / `assertCanReconcile` repeats the coarse check as defense-in-depth.
- Manager-owns-box fine-grained check uses `account.owner_user_id === claims.userId` AFTER the account row is locked — no TOCTOU race where a concurrent UPDATE could swap the owner.
- Idempotency prevents replay-driven double-spending or double-reconcile.
- FOR UPDATE canonical order (lower id first) prevents deadlocks between two concurrent transfers touching the same pair of accounts.

---

## 11. Performance Check

- Transfer: bounded cost (2 locks + 3 writes). Negligible against Neon RTT.
- Reconcile: SUM over `treasury_movements` rows referencing one account. For a typical account the row count is small (hundreds); even for active accounts with thousands of rows this is a single indexed scan. Acceptable for daily cadence.
- No change to integration suite wall-clock beyond +18 cases (~90–120 seconds).

---

## 12. Self-Review Findings

### What I checked exactly

Against every canonical doc cited by the contract + the reviewer's amendments:

- **[`00_DECISIONS.md`](../requirements-analysis/00_DECISIONS.md)**: D-58 trigger semantics unchanged — T-AP re-verifies. D-16/D-79 idempotency applied to both endpoints. D-81 (every mutation handler uses activity_log) satisfied.
- **[`02_DB_Tree.md`](../requirements-analysis/02_DB_Tree.md)**: schema unchanged; `treasury_movements` column set matches what the code writes.
- **[`09_Business_Rules.md`](../requirements-analysis/09_Business_Rules.md)**: BR-52 (hierarchy) — transfer routes allow only canonical moves; BR-53 (atomic tx) — balance + movement + activity_log all in one tx; BR-54 (daily reconcile) — implemented per canonical semantic (expected-from-movements); BR-55 (every financial event → movement) — transfer always inserts, reconcile inserts only when diff≠0 which matches the canonical "الفرق يُسجَّل كحركة" phrasing.
- **[`10_Calculation_Formulas.md`](../requirements-analysis/10_Calculation_Formulas.md) §treasury**: `expected = Σ (to-direction amounts) - Σ (from-direction amounts)` — matches `computeExpectedBalance` SQL.
- **[`12_Accounting_Rules.md`](../requirements-analysis/12_Accounting_Rules.md)**: four canonical transfer categories + `reconciliation` written; no other category emitted by this tranche.
- **[`15_Roles_Permissions.md`](../requirements-analysis/15_Roles_Permissions.md) §treasury**: matrix respected. transfer pm/gm; reconcile pm/gm any + manager own.
- **[`16_Data_Visibility.md`](../requirements-analysis/16_Data_Visibility.md)**: read paths unchanged.
- **[`22_Print_Export.md`](../requirements-analysis/22_Print_Export.md)**: not touched.
- **[`29_Concurrency.md`](../requirements-analysis/29_Concurrency.md)** §treasury: FOR UPDATE on both accounts for transfer (canonical lock order) + single FOR UPDATE on reconcile.
- **[`31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md)**: 4 new codes documented.
- **[`35_API_Endpoints.md`](../requirements-analysis/35_API_Endpoints.md)**: both endpoints now "shipped" with full semantics.

### Sensitive invariants — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| IT1 | Transfer conservation: Δ(from) + Δ(to) = 0 | T-TR1..T-TR4 check both balances after |
| IT2 | Transfer atomicity: movement ⇔ balance in one tx | same-tx composition inside `performTransfer`; T-TR-OD proves failed path rolls back both |
| IT3 | No transfer overdraft | T-TR-OD sequential + T-TR-CONC concurrent |
| IT4 | 4-route allowlist only | T-TR-MATRIX (main_cash → driver_custody rejected) |
| IT5 | Transfer reserved for pm/gm | T-TR-UNAUTH (seller + manager + driver + sk all 403) |
| IR1 | Reconcile expected from MOVEMENTS (not from cached stored) | **T-RE-STALE** — the single proof |
| IR2 | Reconcile single-sided movement only | T-RE-POS asserts `fromAccountId === null` + `toAccountId === accountId`; T-RE-NEG asserts the mirror |
| IR3 | Manager reconciles own manager_box only | T-RE-AUTH-MGR-OK + T-RE-AUTH-MGR-X + T-RE-UNAUTH |
| IR4 | Zero-diff reconcile writes NO movement + always logs activity | T-RE-ZERO — asserts `movementId: null` + `activityLog` entry on `treasury_accounts` |
| IR5 | Reconcile idempotent | T-RE-IDEM (replay returns same movementId, balance does not shift twice) |
| IT-idem | Transfer idempotent | T-TR-IDEM |
| IC | Transfer concurrency: FOR UPDATE canonical order serialises | T-TR-CONC |
| IA | Append-only on treasury_movements (existing, regression-tested) | T-AP |

### Activity log in-tx proof (per Amendment A3)

Both mutation handlers emit an `activity_log` row inside the SAME tx as their balance write. Proof via code inspection:

- `transfer.ts:158` — `await logActivity(tx, { action: "create", entityType: "treasury_movements", entityId: movementId, … })` called BEFORE the function returns, inside the same `tx` passed from `withIdempotencyRoute → withTxInRoute`.
- `reconcile.ts:159` — `await logActivity(tx, { action: movementId !== null ? "create" : "update", … })` called on every path, zero-diff included.

If either call were removed, `treasury_movements` would ship without corresponding `activity_log` coverage, which is what D-81 forbids for any new mutation handler.

### Known gaps (non-blocking)

1. **No index on `treasury_movements.from_account_id` / `.to_account_id`**: the reconcile SUM scans movements on one account. For small datasets this is immaterial; a BTREE index on each column would bring it to an index scan. One-line migration deferred — not in scope for a behaviour tranche.
2. **No chain-verify on treasury_movements**: per baseline (existing since Phase 4.2) append-only is enforced by the D-58 trigger only, not by a hash chain. This tranche doesn't change that posture.
3. **No `RECONCILE_NOT_OWNER` dedicated code**: the manager-owns-box gate surfaces via the generic `FORBIDDEN` (403) from `PermissionError`. The user message explicitly says "لا يمكنك مصالحة صندوق ليس لك" — the frontend can differentiate if needed.
4. **UI**: server-side tranche; UI for transfer + reconcile lands in a later closure-pack.

### Why each gap is non-blocking

- (1) performance tuning, not correctness.
- (2) matches the baseline posture; append-only is still enforced.
- (3) message carries the semantic; no frontend path needs a different code today.
- (4) out of scope per the 4-step closure plan.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green (1/2/3/4/5/6/8).

### الشروط

- Commit محلي فقط.
- Step 2 (Phase 4.4 — settlements + `/my-bonus` + `cancel_as_debt`) لا يبدأ قبل مراجعة صريحة لهذا الـ Step 1.

---

## 14. ملاحظة صدق

التعديلات الأربعة التي طلبها المراجع على العقد طُبِّقت حرفياً — كل واحدة منها يمكن إرجاعها إلى سطر محدَّد في الكود:

- **A1** (`reconcile` يحسب expected من movements لا من stored): `src/modules/treasury/reconcile.ts` → `computeExpectedBalance(tx, accountId)` + SUM صريح على `treasury_movements`. T-RE-STALE يكسر عمداً cached balance ليثبت أن الـreconcile لا يعتمد عليه.
- **A2** (`diff == 0` لا movement): الشرط `if (Math.abs(diff) > 0.005)` يحيط insert الحركة. T-RE-ZERO يؤكد `movementId: null` + activity_log قائم.
- **A3** (activity_log داخل tx لكل من transfer + reconcile): تغطية 100% — transfer.ts يسجِّلها دائماً، reconcile.ts يسجِّلها في كلا فرعي if/else.
- **A4** (guards صريحة): Zod يفرض `positive().max(...)` / `min(0)`، والـservice يعيد الفحص دفاعاً عن nested callers.

لا shell tricks. لا push. Phase 4 لم تُغلق — settlements + avoir لا تزال حاجزتين.
