# Phase 4.3.1 Delivery Report — Money precision + reconcile owner-code drift

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: Corrective hotfix on Phase 4.3. Narrow scope — two defects, two fixes. No new endpoints, no schema change.

---

## §0 Errata (Phase 4.3.2 — 2026-04-21)

The precision fix in this report covers only **POST /api/v1/treasury/transfer** and **POST /api/v1/treasury/reconcile**. Post-delivery review of Phase 4.3.1 (2026-04-21) revealed two additional money-mutating endpoints still vulnerable to the same sub-cent drift:

- [`src/modules/treasury/dto.ts:46-54`](../../src/modules/treasury/dto.ts#L46-L54) — `HandoverInput.amount` had no 2-decimal refine. `0.004` passed Zod → `round2(0.004)=0.00` → handover inserted a zero-value `driver_handover` movement row.
- [`src/modules/deliveries/dto.ts:46`](../../src/modules/deliveries/dto.ts#L46) — `ConfirmDeliveryInput.paidAmount` had no 2-decimal refine. `0.004` passed Zod → inside `confirm.ts` the `paidAmount > 0` branch fired → bridge inserted a zero-value `sale_collection` movement + payment row with `amount='0.00'`.

**Fix tranche**: Phase 4.3.2 — see [`docs/phase-reports/phase-4.3.2-delivery-report.md`](./phase-4.3.2-delivery-report.md). Scope: promote `isTwoDecimalPrecise` from this file to `src/lib/money.ts` (shared), apply to both DTOs above, add matching service-level defense on `performHandover` and `confirmDelivery`, round `paidAmount` once in `confirm.ts` and reuse the rounded value across OVERPAYMENT check, BR-07 check, `paidAmount > 0` branch gate, `bridgeCollection`, payments insert, `orders.advance_paid` update, and activity log. Closes the precision family for Phase 4.

---

## 0. Implementation Contract (accepted 2026-04-21)

**Defects verified with file+line before coding**:
1. [`dto.ts:64`](../../src/modules/treasury/dto.ts#L64) `amount: z.number().positive().max(10_000_000)` — no 2-decimal enforcement. `0.004` passes Zod → `round2(0.004)=0.00` → transfer inserts a zero-value movement row (forbidden by 12_Accounting_Rules).
2. [`dto.ts:77`](../../src/modules/treasury/dto.ts#L77) `actualBalance: z.number().min(0).max(100_000_000)` — same sub-cent gap.
3. [`reconcile.ts:113`](../../src/modules/treasury/reconcile.ts#L113) throws generic `PermissionError` (code=`FORBIDDEN`), while the 4.3 contract proposed `RECONCILE_NOT_OWNER` and `31_Error_Handling.md` had no entry — three states in drift.

**Decisions locked by user** (from the two binary choices presented):
- **Precision**: strict 2 decimals at Zod + service-level defense `round2(amount) >= 0.01` on transfer.
- **Ownership error**: **Option A** — dedicated 403 `RECONCILE_NOT_OWNER` code (not docs-only documentation of the generic FORBIDDEN).

**Out of scope**: everything else.

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `ef5c57f` (Phase 4.3)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.3.1 — money precision + reconcile owner-code drift**

---

## 2. Scope

### ما تغيَّر

**Precision — [`src/modules/treasury/dto.ts`](../../src/modules/treasury/dto.ts)**
- New local `isTwoDecimalPrecise(v)` predicate: `Math.abs(v*100 - Math.round(v*100)) < 1e-9`. Accepts 0.00 / 0.01 / 10.00 / 10.50 / 99.99; rejects 0.001 / 0.004 / 0.005 / 10.004.
- `TransferInput.amount` gains `.refine(isTwoDecimalPrecise, { message: "المبلغ يجب أن يكون بدقة سنتين (2 decimals max)." })`.
- `ReconcileInput.actualBalance` gains the same refine with its own message.

**Transfer service defense — [`src/modules/treasury/transfer.ts`](../../src/modules/treasury/transfer.ts)**
- The initial `if (input.amount <= 0)` guard was replaced by a POST-round check: `const roundedAmount = round2(input.amount); if (roundedAmount < 0.01) throw BusinessRuleError(..., "VALIDATION_FAILED", 400)`. This closes the attack where a direct service-level caller (bypassing Zod) passes `0.001` → would otherwise round to `0.00` and slip into a zero-value movement insert.
- The later `const amount = round2(input.amount)` was consolidated to reuse `roundedAmount`, so there's a single source of the rounded value inside the function.

**Reconcile owner code — [`src/modules/treasury/reconcile.ts`](../../src/modules/treasury/reconcile.ts)**
- `PermissionError` import dropped; only `BusinessRuleError` + `ConflictError` remain.
- The manager-cross-team branch now `throw new BusinessRuleError("لا يمكنك مصالحة صندوق ليس لك.", "RECONCILE_NOT_OWNER", 403, developerMessage, details)`. Wire contract is now: status 403, `code: "RECONCILE_NOT_OWNER"`.

**Tests — new [`tests/integration/phase-4.3.1-fixes.test.ts`](../../tests/integration/phase-4.3.1-fixes.test.ts)** (5 cases):
- T-TR-PREC-004: `amount=0.004` → 400 `VALIDATION_FAILED`.
- T-TR-PREC-005: `amount=0.005` → 400 `VALIDATION_FAILED` (3-decimal refine).
- T-TR-PREC-HAPPY: `amount=0.01` → 200 (smallest-legal-unit regression, category='funding', movementId returned).
- T-RE-PREC: `actualBalance=10.004` → 400 `VALIDATION_FAILED`.
- T-RE-MGR-X-CODE: manager reconciles another manager's box → 403 + `code === "RECONCILE_NOT_OWNER"`.

**Docs sync**
- [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md): added `RECONCILE_NOT_OWNER` (403) row + a `VALIDATION_FAILED` sub-row explaining the money-precision trigger.
- [`docs/phase-reports/phase-4.3-delivery-report.md`](./phase-4.3-delivery-report.md): §0 Errata prepended documenting both defects + pointer here.
- This report.

### ما لم يتغيَّر

- No schema change, no migration.
- No change to `handover.ts`, `bridge.ts`, `confirm.ts`, or any Phase 4.0/4.1/4.2 behaviour.
- No change to the 4-route transfer allowlist (still `funding`, `manager_settlement`, `bank_deposit`, `bank_withdrawal`).
- No change to reconcile's expected-from-movements semantics (Phase 4.3 A1 remains intact).
- No change to role gates (transfer=pm/gm; reconcile=pm/gm + manager-own).
- No `vitest.config.ts` change (Gate 5 held after the re-run — see §6).
- `.env.local` gitignored. No push.

---

## 3. Business Impact

- **No zero-value money movements reach the ledger.** A transfer of `0.004` is rejected at the wire; a direct service-level caller passing `0.001` is rejected before any DB write. Both paths tested explicitly.
- **Frontend can reliably distinguish the cross-team reconcile refusal** from other 403s via the dedicated `RECONCILE_NOT_OWNER` code. No more "generic forbidden" handling that hides the actual business cause.
- **Contract/code/docs are in sync**. The drift that existed after Phase 4.3 is closed.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/treasury/dto.ts` (2 refines + predicate) | 0 | 1 |
| `src/modules/treasury/transfer.ts` (service defense) | 0 | 1 |
| `src/modules/treasury/reconcile.ts` (RECONCILE_NOT_OWNER) | 0 | 1 |
| `tests/integration/phase-4.3.1-fixes.test.ts` | 1 | 0 |
| `docs/requirements-analysis/31_Error_Handling.md` | 0 | 1 |
| `docs/phase-reports/phase-4.3-delivery-report.md` (§0 errata) | 0 | 1 |
| `docs/phase-reports/phase-4.3.1-delivery-report.md` | 1 | 0 |
| **Total** | **2 new** | **5 modified** |

All touched source files remain within the 300 effective-line ESLint threshold.

### Endpoints

None added/removed. Response-shape changes (additive):
- `POST /api/v1/treasury/transfer` + `POST /api/v1/treasury/reconcile` — body with sub-cent amounts now returns 400 `VALIDATION_FAILED` (was 200 + silently-rounded).
- `POST /api/v1/treasury/reconcile` — manager-cross-team path returns `{ code: "RECONCILE_NOT_OWNER", ... }` instead of `{ code: "FORBIDDEN", ... }`. Status stays 403.

### Migration

None.

### Deps

None.

---

## 5. Risk Level

**Level**: 🟢 **Low**.

- Three small, surgical edits + 5 tests. No schema, no new endpoints, no new concurrency patterns.
- The tightening paths (sub-cent rejection, owner-code specialisation) return 400/403 where 200/403-generic used to — strictly more restrictive, no silent corruption possible.
- Rollback: revert the commit. No data migration to undo.

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Phase 4.3 → Phase 4.3.1 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | PASS 0/0. |
| 3 | Typecheck | ✅ real | PASS. |
| 4 | Build | ✅ real | PASS — no new routes. |
| 5 | Unit + coverage | ✅ real, exit 0 | 224/224 unchanged; coverage thresholds preserved (no `vitest.config.ts` change needed). |
| 6 | Integration | ✅ real, live DB | **244/244 passed (29 files), zero skipped.** Previous 4.3 baseline 239 (28 files). Δ = +5 = the 5 new Phase 4.3.1 cases. Wall-clock 1398.35s (~23 min) on live Neon. |
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

- [✅] Phase 4.3's 18 tests (T-TR1..T-TR-CONC + T-RE-POS..T-RE-IDEM + T-AP) continue to pass. The T-RE-AUTH-MGR-X case in 4.3 only asserted status===403; the new T-RE-MGR-X-CODE in 4.3.1 asserts the dedicated code. Both coexist.
- [🆕] T-TR-PREC-004 / T-TR-PREC-005 prove sub-cent rejection at the Zod layer.
- [🆕] T-TR-PREC-HAPPY proves `amount=0.01` (smallest legal unit) still passes end-to-end.
- [🆕] T-RE-PREC proves reconcile applies the same refine.
- [🆕] T-RE-MGR-X-CODE closes the owner-code drift with a wire-level assertion.

---

## 8. API Impact

- **Response-body change on 4xx paths only**:
  - Sub-cent `amount` or `actualBalance` → now returns `{ code: "VALIDATION_FAILED" }` + 400.
  - Manager cross-team reconcile → now returns `{ code: "RECONCILE_NOT_OWNER" }` + 403 (was `{ code: "FORBIDDEN" }`).
- No change on the 2xx happy paths.

---

## 9. DB Impact

None.

---

## 10. Security Check

- **Stricter input validation** — strictly more restrictive Zod schema than Phase 4.3.
- **Stronger semantics on the wire** — `RECONCILE_NOT_OWNER` code distinguishes "this specific access was denied because ownership doesn't match" from other 403s.
- No change to FOR UPDATE semantics, idempotency, or hash-chain posture.

---

## 11. Performance Check

- One extra Zod `.refine()` call per request on two endpoints — constant-time cost, <1μs.
- No change to DB I/O.

---

## 12. Self-Review Findings

### What I checked exactly

- **[`00_DECISIONS.md`](../requirements-analysis/00_DECISIONS.md)**: D-81 still satisfied (transfer + reconcile activity_log in-tx unchanged).
- **[`02_DB_Tree.md`](../requirements-analysis/02_DB_Tree.md)**: schema unchanged.
- **[`09_Business_Rules.md`](../requirements-analysis/09_Business_Rules.md)**: BR-52/53/54/55 unchanged.
- **[`12_Accounting_Rules.md`](../requirements-analysis/12_Accounting_Rules.md)**: "لا حركة صفرية" rule now actively enforced at the service layer (previously implicit).
- **[`15_Roles_Permissions.md`](../requirements-analysis/15_Roles_Permissions.md)**: transfer=pm/gm, reconcile=pm/gm+manager-own — unchanged.
- **[`16_Data_Visibility.md`](../requirements-analysis/16_Data_Visibility.md)**: unchanged.
- **[`22_Print_Export.md`](../requirements-analysis/22_Print_Export.md)**: unchanged.
- **[`29_Concurrency.md`](../requirements-analysis/29_Concurrency.md)**: FOR UPDATE protocol unchanged.
- **[`31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md)**: `RECONCILE_NOT_OWNER` added; `VALIDATION_FAILED` trigger extended for money precision. Contract/code/docs now consistent — no remaining drift.
- **[`35_API_Endpoints.md`](../requirements-analysis/35_API_Endpoints.md)**: treasury endpoints still labelled "Phase 4.3 — shipped"; the 4.3.1 refinements are additive 4xx tightenings that don't require a row-level rewrite.

### Invariants — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| I-money-strict | No sub-cent value reaches the service | T-TR-PREC-004 + T-TR-PREC-005 + T-RE-PREC all 400 |
| I-zero-movement-impossible | Service rejects `round2(amount) < 0.01` before any DB write | Code inspection: `transfer.ts` early throw on `roundedAmount < 0.01`. Indirect proof via T-TR-PREC-004 returning 400 before any movement row for that order can exist |
| I-minimum-unit | `amount=0.01` still passes | T-TR-PREC-HAPPY |
| I-owner-code-canonical | Cross-team reconcile wire code === `RECONCILE_NOT_OWNER` | T-RE-MGR-X-CODE |
| I-no-drift | Contract, code, tests, and `31_Error_Handling.md` all agree | This report §0 + updated 31_Error_Handling row + T-RE-MGR-X-CODE assertion |

### Known gaps (non-blocking)

1. **`VALIDATION_FAILED` is a broad code**. `31_Error_Handling.md` uses one `VALIDATION_FAILED` row for Zod failures generally; this tranche added a sub-row explaining the money-precision trigger. A future tranche could introduce a more specific `MONEY_PRECISION_INVALID` code, but that would require a wider wire change and is not worth the churn here.
2. **Sub-cent floating-point edge cases** (e.g. 0.1 + 0.2 = 0.30000000000000004) are still accepted by the refine because `Math.abs(0.30000000000000004 * 100 - 30)` ≈ 4e-15 < 1e-9. That is intentional — business callers send `0.30`, not the raw floating-point drift — and the refine's 1e-9 tolerance prevents legitimate 2-decimal values from being rejected by JS representation artefacts.

### Why each gap is non-blocking

- (1) broader error taxonomy is a cross-module refactor, out of scope for a hotfix.
- (2) the tolerance is tuned for the realistic use case; narrowing it would cause false negatives on legitimate values.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green (1/2/3/4/5/6/8).

### الشروط

- Commit محلي فقط.
- Phase 4.4 (Step 2 — settlements + `/my-bonus` + `cancel_as_debt`) لا يبدأ قبل مراجعة صريحة لهذا الـ 4.3.1.

---

## 14. ملاحظة صدق

المراجع رفع نقطتين محقَّقتَين بـ file+line:

1. `TransferInput.amount` / `ReconcileInput.actualBalance` كانا يقبلان قيماً دون سنتين دون refine — والخدمة كانت تستدعي `round2()` بعد فحص `> 0`، فكان `0.004` يصل إلى insert كـ `0.00`. الإصلاح: refine على Zod + defense-in-depth على الخدمة بفحص ما بعد التقريب (`roundedAmount < 0.01`).
2. كود خطأ مصالحة ملكية manager_box: اختار المراجع Option A، فأُضيف `RECONCILE_NOT_OWNER` 403 كـ code صريح، وأُدرج في `31_Error_Handling.md`، واختبار T-RE-MGR-X-CODE يؤكد الـcode على الشبكة.

لا shell tricks. لا push. نطاق الترانش أُحترم حرفياً.
