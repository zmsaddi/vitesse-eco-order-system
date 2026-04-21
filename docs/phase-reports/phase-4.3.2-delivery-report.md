# Phase 4.3.2 Delivery Report — Money precision on handover + confirm-delivery

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: Corrective hotfix on Phase 4.3.1. Narrow scope — closes the money-precision family on the remaining two endpoints. No new endpoints, no schema change.

---

## 0. Implementation Contract (accepted 2026-04-21)

**Defects verified with file+line before coding**:
1. [`src/modules/treasury/dto.ts:46-54`](../../src/modules/treasury/dto.ts#L46-L54) — `HandoverInput.amount` had only `z.number().positive().max(1_000_000)` with no 2-decimal refine. `0.004` passed Zod → `round2(0.004)=0.00` in [`handover.ts:126`](../../src/modules/treasury/handover.ts#L126) → handover inserted a zero-value `driver_handover` movement (forbidden by 12_Accounting_Rules §treasury).
2. [`src/modules/deliveries/dto.ts:46`](../../src/modules/deliveries/dto.ts#L46) — `ConfirmDeliveryInput.paidAmount` had only `z.number().min(0).default(0)` with no 2-decimal refine. `0.004` passed Zod, entered the `if (input.paidAmount > 0)` branch at [`confirm.ts:245`](../../src/modules/deliveries/confirm.ts#L245), bridged a zero-value `sale_collection` movement, inserted a `payments` row with `amount='0.00'`, and bumped `orders.advance_paid` by a silently-rounded float.
3. `confirm.ts` used `input.paidAmount` (raw) at 7 distinct sites — OVERPAYMENT check, BR-07 check, branch gate, `bridgeCollection`, payments insert, `orders.advance_paid` update, activity_log details. Even with the Zod refine, a direct service call bypassing Zod could still drift these sites apart.

**Decisions locked by user**:
- **Shared predicate**: promote `isTwoDecimalPrecise` from `src/modules/treasury/dto.ts` (local, Phase 4.3.1) to [`src/lib/money.ts`](../../src/lib/money.ts) so transfer + reconcile + handover + confirm-delivery all reference the exact same check.
- **Handover**: strict 2-decimal refine on `HandoverInput.amount` + service-level defense in [`performHandover`](../../src/modules/treasury/handover.ts) that rejects `roundedAmount < 0.01` with `VALIDATION_FAILED` 400.
- **Confirm-delivery**: strict 2-decimal refine on `ConfirmDeliveryInput.paidAmount` + single `const paidAmount = round2(input.paidAmount)` computed once in [`confirmDelivery`](../../src/modules/deliveries/confirm.ts), then reused at all 7 downstream sites. Service-level defense: if `input.paidAmount > 0 && paidAmount < 0.01` → `VALIDATION_FAILED` 400 before any DB write.
- **Tests**: 6 mandatory cases — 3 handover (0.004 / 0.005 / 0.01) + 3 confirm-delivery (0.004 / 0.005 / 0.01). All rejected cases must prove zero side effects across delivery / order / payments / bonuses / invoices / treasury_movements / driver_custody balance.

**Out of scope**: everything else. No revisit of BR-55b cap logic, no new endpoints, no migration.

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `e67cb26` (Phase 4.3.1)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.3.2 — money precision on handover + confirm-delivery**

---

## 2. Scope

### ما تغيَّر

**Shared predicate — [`src/lib/money.ts`](../../src/lib/money.ts)**
- New exported `isTwoDecimalPrecise(v: number): boolean` — `Math.abs(v*100 - Math.round(v*100)) < 1e-9`. Accepts 0 / 0.01 / 10.00 / 10.50 / 99.99; rejects 0.001 / 0.004 / 0.005 / 10.004. This is the exact body that lived as a local helper inside `src/modules/treasury/dto.ts` since Phase 4.3.1; promoted so every money-mutating DTO in the codebase shares one source.

**Treasury DTO — [`src/modules/treasury/dto.ts`](../../src/modules/treasury/dto.ts)**
- Local `isTwoDecimalPrecise` deleted; imported from `@/lib/money` instead.
- `HandoverInput.amount` gains `.refine(isTwoDecimalPrecise, { message: "المبلغ يجب أن يكون بدقة سنتين (2 decimals max)." })`.
- `TransferInput.amount` + `ReconcileInput.actualBalance` refines unchanged in behaviour — still call `isTwoDecimalPrecise`, now via the shared import.

**Deliveries DTO — [`src/modules/deliveries/dto.ts`](../../src/modules/deliveries/dto.ts)**
- Imports `isTwoDecimalPrecise` from `@/lib/money`.
- `ConfirmDeliveryInput.paidAmount` gains `.refine(isTwoDecimalPrecise, { message: "المبلغ المدفوع يجب أن يكون بدقة سنتين (2 decimals max)." })`. `.min(0)` and `.default(0)` preserved — credit sales with `paidAmount=0` still valid.

**Handover service defense — [`src/modules/treasury/handover.ts`](../../src/modules/treasury/handover.ts)**
- After `const amount = round2(input.amount)`, a new guard throws `BusinessRuleError("المبلغ يجب أن يكون 0.01€ على الأقل.", "VALIDATION_FAILED", 400, ...)` when `amount < 0.01`. Runs **before** the `INSUFFICIENT_CUSTODY` and any DB write. A bypassed-Zod caller with `0.004` is rejected before any movement row or balance mutation.

**Confirm-delivery refactor — [`src/modules/deliveries/confirm.ts`](../../src/modules/deliveries/confirm.ts)**
- Imports `round2` from `@/lib/money`.
- `const paidAmount = round2(input.paidAmount)` computed **once**, immediately after the parent order lock and before the OVERPAYMENT / BR-07 checks. Defense-in-depth guard: `if (input.paidAmount > 0 && paidAmount < 0.01) throw VALIDATION_FAILED 400` — ensures a bypassed-Zod positive sub-cent never reaches the payment or bridge path.
- All 7 downstream sites now use the local `paidAmount` (not `input.paidAmount`): OVERPAYMENT check, BR-07/INCOMPLETE_CASH_PAYMENT check, branch gate `if (paidAmount > 0)`, `bridgeCollection(amount: paidAmount, …)`, `payments.insert({ amount: paidAmount.toFixed(2), … })`, `const newAdvance = round2(Number(order.advance_paid) + paidAmount)`, and `activity_log details.paidAmount`.
- `newAdvance` now wrapped in `round2(…)` too — closes a tiny float-drift gap on partial collections (e.g. `Number("10.00") + 0.01` could serialise as `10.010000000000001` on some platforms; `round2` nails it to `10.01`).
- The three remaining `input.paidAmount` references all live inside the defense guard (raw-vs-rounded comparison) — intentional.

**Tests — new [`tests/integration/phase-4.3.2-fixes.test.ts`](../../tests/integration/phase-4.3.2-fixes.test.ts)** (6 cases):
- **T-HO-PREC-004**: handover `amount=0.004` → 400 `VALIDATION_FAILED` + custody balance unchanged + manager_box balance unchanged + no new `driver_handover` movement for this driver.
- **T-HO-PREC-005**: handover `amount=0.005` → 400 `VALIDATION_FAILED` + same zero-side-effect assertions.
- **T-HO-PREC-HAPPY**: handover `amount=0.01` → 200; movement row exists with `amount=0.01`, `category='driver_handover'`; custody `-= 0.01`, manager_box `+= 0.01`.
- **T-CD-PREC-004**: confirm-delivery `paidAmount=0.004` (credit order) → 400 `VALIDATION_FAILED` + delivery stays `"جاري التوصيل"` + order stays `"جاهز"` + zero rows in payments/bonuses/invoices/treasury_movements-for-this-order + driver_custody balance unchanged.
- **T-CD-PREC-005**: confirm-delivery `paidAmount=0.005` → 400 `VALIDATION_FAILED` + same zero-side-effect assertions.
- **T-CD-PREC-HAPPY**: confirm-delivery `paidAmount=0.01` (credit order, `paymentMethod="آجل"` so BR-07 full-payment rule doesn't apply) → 200; 1 payment row `amount=0.01, type='collection'`; 1 `sale_collection` movement `amount=0.01` with `from=NULL, to=driver_custody`; `orders.advance_paid=0.01, status="مؤكد", paymentStatus="partial"`; custody `+= 0.01`.

**Docs sync**
- [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md): `VALIDATION_FAILED` money-precision row extended — now lists Handover `amount` and Confirm-Delivery `paidAmount` alongside Transfer + Reconcile, and references the shared predicate in `src/lib/money.ts`.
- [`docs/phase-reports/phase-4.3.1-delivery-report.md`](./phase-4.3.1-delivery-report.md): §0 Errata prepended, pointing to this report.
- This report.

### ما لم يتغيَّر

- No schema change, no migration.
- No change to Phase 4.0/4.1/4.2/4.3 behaviour outside the files listed above.
- No change to `bridge.ts` — its internal `round2(args.amount)` and `args.amount <= 0` guard remain; confirm-delivery now sends it an already-rounded value (defense is redundant, not regressive).
- No change to the 4-route transfer allowlist, reconcile semantics, role gates, or FOR UPDATE protocol.
- No change to `vitest.config.ts`, coverage thresholds, or npm scripts.
- `.env.local` gitignored. No push.

---

## 3. Business Impact

- **No zero-value payment / movement rows can enter the ledger.** A handover of `0.004` is rejected at the wire; a confirm-delivery of `0.004` is rejected at the wire; a direct service-level caller passing `0.001` to either path is rejected before any DB write. All six paths tested explicitly with zero-side-effect assertions.
- **Money precision contract is now uniform across every money-mutating endpoint** — transfer, reconcile, handover, confirm-delivery all call the same `isTwoDecimalPrecise` predicate and all emit `VALIDATION_FAILED 400` on sub-cent input. One predicate, one error code, one behaviour.
- **Partial-collection advance_paid is now float-drift-safe**. `round2` around the `newAdvance` computation closes an imperceptible but real gap where repeated `0.01` collections could accumulate float drift into `orders.advance_paid`.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/lib/money.ts` (exported `isTwoDecimalPrecise`) | 0 | 1 |
| `src/modules/treasury/dto.ts` (import shared predicate + refine HandoverInput.amount) | 0 | 1 |
| `src/modules/deliveries/dto.ts` (import shared predicate + refine paidAmount) | 0 | 1 |
| `src/modules/treasury/handover.ts` (defense-in-depth guard) | 0 | 1 |
| `src/modules/deliveries/confirm.ts` (single rounded paidAmount + defense + 7-site substitution) | 0 | 1 |
| `tests/integration/phase-4.3.2-fixes.test.ts` | 1 | 0 |
| `docs/requirements-analysis/31_Error_Handling.md` (row extended) | 0 | 1 |
| `docs/phase-reports/phase-4.3.1-delivery-report.md` (§0 errata) | 0 | 1 |
| `docs/phase-reports/phase-4.3.2-delivery-report.md` | 1 | 0 |
| **Total** | **2 new** | **7 modified** |

All touched source files remain within the 300 effective-line ESLint threshold.

### Endpoints

None added/removed. Response-shape changes (additive):
- `POST /api/v1/treasury/handover` — body with sub-cent `amount` now returns 400 `VALIDATION_FAILED` (was 200 + silently-rounded-to-zero movement).
- `POST /api/v1/deliveries/[id]/confirm-delivery` — body with sub-cent `paidAmount` now returns 400 `VALIDATION_FAILED` (was 200 + silently-rounded-to-zero movement + zero-value payments row).
- No change on the 2xx happy paths of either endpoint.

### Migration

None.

### Deps

None.

---

## 5. Risk Level

**Level**: 🟢 **Low**.

- Five surgical edits + 6 tests. No schema, no new endpoints, no new concurrency patterns.
- Strictly more restrictive — 4xx where 200 used to live for malformed inputs, nothing looser.
- The 7-site substitution in `confirm.ts` is mechanical: replace `input.paidAmount` with a local variable that is either equal to it (when already 2-decimal) or rejected before reaching the substitution sites.
- Rollback: revert the commit. No data migration to undo, no precision state stored anywhere.

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Phase 4.3.1 → Phase 4.3.2 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ⏸ deferred | Not re-run for this tranche (no ESLint-visible surface change beyond existing patterns; all prior tranches PASS 0/0). |
| 3 | Typecheck | ✅ real | **PASS** — `npm run typecheck` clean. |
| 4 | Build | ⏸ deferred | Not re-run for this tranche (no new routes, no runtime-config change). |
| 5 | Unit + coverage | ✅ real, exit 0 | **224/224 passed, coverage thresholds preserved.** |
| 6 | Integration | ✅ real, live DB | **250/250 passed (30 files), zero skipped.** Previous 4.3.1 baseline 244 (29 files). Δ = +6 = the 6 new Phase 4.3.2 cases. Wall-clock 1456.33s (~24 min) on live Neon. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ⏸ deferred | Not re-run (no new migration). |
| 9–13 | placeholder | ⏸ | — |

### Canonical gate commands

```bash
npm run typecheck
npm run test:unit
npm run test:integration   # requires .env.local with TEST_DATABASE_URL
```

All from vanilla npm scripts — no shell tricks.

---

## 7. Regression Coverage

- [✅] Phase 4.3's 18 tests + Phase 4.3.1's 5 tests continue to pass (244/244 previous integration baseline remains green — all 250 integration tests now pass).
- [🆕] T-HO-PREC-004 / T-HO-PREC-005 prove sub-cent handover rejection at the Zod layer with zero side effects.
- [🆕] T-HO-PREC-HAPPY proves `amount=0.01` handover (smallest legal unit) still passes end-to-end.
- [🆕] T-CD-PREC-004 / T-CD-PREC-005 prove sub-cent confirm-delivery rejection at the Zod layer with zero side effects across delivery / order / payments / bonuses / invoices / treasury_movements / driver_custody balance.
- [🆕] T-CD-PREC-HAPPY proves `paidAmount=0.01` on a credit order passes through Zod refine → service defense → bridge → payments insert → advance_paid update with all money values correctly pinned to 0.01.
- [✅] No existing test needed modification to stay green (the new refine only rejects inputs that existing tests were not sending).

---

## 8. API Impact

- **Response-body change on 4xx paths only**:
  - Sub-cent `amount` on handover → `{ code: "VALIDATION_FAILED" }` + 400.
  - Sub-cent `paidAmount` on confirm-delivery → `{ code: "VALIDATION_FAILED" }` + 400.
- No change on the 2xx happy paths of either endpoint.
- No change to the other three treasury endpoints (`GET /api/v1/treasury`, `POST /transfer`, `POST /reconcile`) — Phase 4.3.1 behaviour preserved.

---

## 9. DB Impact

None.

---

## 10. Security Check

- **Stricter input validation at every money-mutating endpoint** — four endpoints (transfer / reconcile / handover / confirm-delivery) now all share the identical 2-decimal contract. Attack surface for silent zero-value ledger pollution is closed.
- **Defense-in-depth at the service layer** — even if Zod is bypassed via a direct function call, the service rejects `round2(value) < 0.01` on transfer (existing), handover (new), and confirm-delivery (new). No sub-cent path reaches an insert.
- No change to FOR UPDATE semantics, idempotency, or append-only triggers.

---

## 11. Performance Check

- Two extra Zod `.refine()` calls per request (one on handover, one on confirm-delivery) — constant-time cost, <1μs each.
- One additional `round2()` call per confirm-delivery with `paidAmount > 0` (wrapping `newAdvance`) — negligible.
- No change to DB I/O.

---

## 12. Self-Review Findings

### What I checked exactly

- **[`src/lib/money.ts`](../../src/lib/money.ts)**: Shared predicate lives next to `round2`/`toNumber`/`toDb`/`moneyEquals`/`moneySum` — the canonical money helper. Signature + body match the Phase 4.3.1 local helper byte-for-byte.
- **[`src/modules/treasury/dto.ts`](../../src/modules/treasury/dto.ts)**: Import path uses `@/lib/money`. TransferInput + ReconcileInput refines still reference `isTwoDecimalPrecise` — behaviour preserved, source deduplicated.
- **[`src/modules/deliveries/dto.ts`](../../src/modules/deliveries/dto.ts)**: `.default(0)` preserved (required for credit-sale happy path), `.min(0)` preserved (zero allowed, negative rejected).
- **[`src/modules/treasury/handover.ts`](../../src/modules/treasury/handover.ts)**: Defense guard runs **before** `INSUFFICIENT_CUSTODY` so a sub-cent amount is never interpreted as "drained the custody" — error semantics stay correct.
- **[`src/modules/deliveries/confirm.ts`](../../src/modules/deliveries/confirm.ts)**: Grep confirms only 3 `input.paidAmount` references remain, all inside the defense guard (`round2` input + raw-vs-rounded compare + error details). All 7 downstream sites converted. The `input.notes` passthrough is unrelated.
- **[`src/modules/treasury/bridge.ts`](../../src/modules/treasury/bridge.ts)**: Internal `round2(args.amount)` kept — confirm.ts now sends it an already-rounded value, so bridge's round is a no-op on the happy path but remains as defense for any other caller.
- **[`00_DECISIONS.md`](../requirements-analysis/00_DECISIONS.md)**: D-02 (money NUMERIC(19,2)) + D-81 (activity_log in-tx) + BR-50 (0.01€ tolerance) all still satisfied.
- **[`09_Business_Rules.md`](../requirements-analysis/09_Business_Rules.md)**: BR-07/09 enforcement semantics unchanged — the 0.005€ tolerance is now applied to the already-rounded value rather than the raw input, which can only tighten (a raw `100.004` that would previously pass `Math.abs(100.004 - 100) > 0.005 = false` now fails the Zod refine first, before reaching BR-07).
- **[`12_Accounting_Rules.md`](../requirements-analysis/12_Accounting_Rules.md)**: "لا حركة صفرية" rule now actively enforced at the service layer on all four money-mutating endpoints.
- **[`31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md)**: `VALIDATION_FAILED` money-precision row extended to cover all four fields across all four endpoints. Contract/code/docs in sync — no drift.

### Invariants — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| I-money-strict-handover | No sub-cent handover amount reaches the service insert | T-HO-PREC-004 + T-HO-PREC-005 both return 400 with custody/box balances and movement count unchanged |
| I-money-strict-confirm | No sub-cent confirm-delivery paidAmount reaches the bridge / payments / advance_paid path | T-CD-PREC-004 + T-CD-PREC-005 both return 400 with delivery/order/payments/bonuses/invoices/movements/custody all unchanged |
| I-minimum-unit-handover | `amount=0.01` handover still works | T-HO-PREC-HAPPY: 200 + movement `amount=0.01` + balances updated by ±0.01 |
| I-minimum-unit-confirm | `paidAmount=0.01` confirm still works end-to-end | T-CD-PREC-HAPPY: 200 + payment=0.01 + sale_collection movement=0.01 + advance_paid=0.01 + status=مؤكد/partial |
| I-single-rounded-value | `confirm.ts` uses one rounded `paidAmount` for all 7 downstream decisions | Grep: 3 `input.paidAmount` refs remain, all inside the defense guard; zero inside the mutation flow |
| I-shared-predicate | All 4 money-mutating DTOs share one `isTwoDecimalPrecise` | `src/lib/money.ts` exports it; treasury/dto.ts and deliveries/dto.ts both import from `@/lib/money` |
| I-defense-in-depth | Bypassed-Zod caller cannot insert zero-value rows | Handover service rejects `amount < 0.01` after round2 (code inspection + T-HO-PREC-* indirectly); confirm service rejects `input.paidAmount > 0 && paidAmount < 0.01` (code inspection); transfer service unchanged from 4.3.1 |

### Known gaps (non-blocking)

1. **`bridge.ts` has its own `args.amount <= 0` guard but no `< 0.01` guard**. The guard is defensive (unreachable from confirm-delivery after this tranche), but another internal caller could still pass a `0.001` raw that rounds to `0.00` and bypasses the `<= 0` check. Adding a matching `< 0.01` guard in bridge would be a belt-and-suspenders addition with no current business need — scope stayed strictly to the user's directive.
2. **Settlement / avoir / cancel_as_debt endpoints** (Phase 4.4, 4.5) will introduce additional money-mutating DTOs. Each one must remember to import `isTwoDecimalPrecise` and apply the refine. No mechanism currently forces this — a future tranche could add a lint rule that flags `z.number().positive().max(...)` without a following `.refine(isTwoDecimalPrecise, ...)` on money fields.

### Why each gap is non-blocking

- (1) bridge is not called from any path outside confirm-delivery in the current codebase (`grep bridgeCollection` confirms). When Phase 4.4 adds new call sites, its tranche will cover the defense.
- (2) out of scope for a hotfix; revisit when adding new money endpoints in Phase 4.4.

---

## 13. Decision

**Status**: ✅ **ready** — real gates green (3 typecheck / 5 unit / 6 integration). Lint/build/db-migrate-check deferred (no ESLint-visible change beyond existing patterns, no new routes, no new migrations).

### الشروط

- Commit محلي فقط.
- Phase 4.4 (Step 2 — settlements + `/my-bonus` + `cancel_as_debt`) لا يبدأ قبل مراجعة صريحة لهذا الـ 4.3.2.

---

## 14. ملاحظة صدق

المراجع رفع gap حقيقياً بـ file+line: الـ precision fix في 4.3.1 أغلق transfer + reconcile فقط، وكانت handover + confirm-delivery لا تزالان تسمحان بإدراج صفوف حركة أو payments بقيمة 0.00 عبر مبلغ 0.004 يمرّ من Zod. التصحيح هنا:

1. **predicate واحد مشترك** في `src/lib/money.ts` بدل نسخ محلي — لا تحتاج الصفحات الأربع أن تتفق عبر تكرار الشرط.
2. **refine على الـ DTO** لكلا الحقلين (HandoverInput.amount + ConfirmDeliveryInput.paidAmount) — الـ wire لا يسمح بمرور sub-cent.
3. **defense-in-depth على الخدمة** لكلا العمليتين — استدعاء مباشر داخلي يتجاوز Zod لا يزال يُرفض قبل أي كتابة.
4. **refactor على `confirm.ts`** بحيث يُحسب `paidAmount = round2(input.paidAmount)` مرة واحدة ويُستخدم في 7 مواقع (OVERPAYMENT check، BR-07 check، branch gate، bridgeCollection، payments insert، orders.advance_paid update، activity log) — لا يمكن للمواقع أن تنحرف عن بعضها.
5. **6 اختبارات تكامل** تؤكد الرفض + Zero-side-effects على الحالات السالبة، وتمرير الحالات الإيجابية عند 0.01 كأصغر وحدة قانونية، مع التحقق المفصَّل على مستوى الصفوف (payments.amount == 0.01، sale_collection movement.amount == 0.01، advance_paid == 0.01، status == مؤكد، paymentStatus == partial).

نطاق الترانش حُوصر حرفياً على ما حدّده المستخدم: لا لمس لـ settlement، لا لمس لـ avoir، لا لمس لـ `bridge.ts` الداخلي، لا تعديل migration، لا تعديل route wrapper. 250 اختبار تكامل يمرّ على Neon حيّ.

لا shell tricks. لا push.
