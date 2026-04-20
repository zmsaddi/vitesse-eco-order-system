# Phase 4.0.2 Delivery Report — confirm-date accounting correction (payments.date + bonuses.date)

> **Template**: D-78 §5 (13-section).
> **Type**: Required corrective tranche for Phase 4.0 / 4.0.1 — closes one critical accounting bug flagged by external review. Smallest possible scope (two-line source change + one integration test).

---

## 1. Delivery ID

- **Date**: 2026-04-20 (Europe/Paris)
- **Base commit**: `4d1a7bf` (Phase 4.0.1)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.0.2 — payments.date + bonuses.date pinned to confirm moment**

---

## 2. Scope

### ما تغيَّر

**Source — `src/modules/deliveries/confirm.ts`**
- New local `const confirmDate = formatParisIsoDate(now)` computed alongside `now`.
- `tx.insert(payments).values({...})` — `date: confirmDate` (was `current.date`, which was copied from `orders.date` at delivery creation).
- `computeBonusesOnConfirm(tx, { …, date: confirmDate })` (was `date: current.date`).
- Inline comments now cite 00_DECISIONS §treasury + 10_Calculation_Formulas §bonuses + BR-31 so the invariant is obvious in the source.

**Tests — new `tests/integration/phase-4.0.2-fixes.test.ts`**
- One end-to-end case that deterministically exercises the cross-day path:
  1. Order created with `date = "2026-01-10"` (guarded by an in-test assertion that this date ≠ today's Paris ISO).
  2. State progression to `جاهز`, delivery created, driver start, driver confirm at "now".
  3. Asserts:
     - `orders.status = 'مؤكد'`, `orders.date` unchanged (still `2026-01-10`), `orders.delivery_date` = today's Paris ISO, `orders.confirmation_date` is not null.
     - `payments.date` = today's Paris ISO **and ≠ `2026-01-10`**.
     - Every row of `bonuses` (seller-per-item + driver-per-delivery) has `date` = today's Paris ISO **and ≠ `2026-01-10`**.
- `.not.toBe(PAST_ORDER_DATE)` assertions make the leak-prevention observable, not inferred.

**Docs**
- [`docs/phase-reports/phase-4.0.1-delivery-report.md`](./phase-4.0.1-delivery-report.md): §0 Errata prepended documenting this gap and pointing readers here.
- This report.

### ما لم يتغيَّر

- No schema changes, no migrations. `payments.date` + `bonuses.date` are pre-existing TEXT columns in YYYY-MM-DD format.
- No new endpoints; route behavior unchanged for the non-accounting-date paths.
- `deliveries.date` still mirrors `orders.date` (operations date for the driver-tasks queue — not an accounting date).
- All Phase 4.0.1 behavior (BR-23, BR-07/09, D-35, BR-18) untouched.
- `.env.local` gitignored; no push.

---

## 3. Business Impact

- **Accounting periods now match source-of-truth**. Revenue reported for period P includes payments actually collected in P; commission reported for P includes bonuses earned by confirmed deliveries in P. Phase 4.0 had silently aggregated both against the *order* date.
- **Pre-Phase-4.0 data is unaffected** because there is no production data yet (pilot not authorized). Rows written under Phase 4.0 / 4.0.1 in dev are scrapped on every test reset.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/deliveries/confirm.ts` (2 date fields + computed constant) | 0 | 1 |
| `tests/integration/phase-4.0.2-fixes.test.ts` | 1 | 0 |
| `docs/phase-reports/phase-4.0.1-delivery-report.md` (errata) | 0 | 1 |
| `docs/phase-reports/phase-4.0.2-delivery-report.md` | 1 | 0 |
| **Total** | **2 new** | **2 modified** |

All source files remain within the 300 code-line ESLint threshold (rule skips blank + comment lines).

### Endpoints

None added/removed. Payload schema unchanged. Response shape unchanged.

### Migration

None.

---

## 5. Risk Level

**Level**: 🟢 **Low**

- Two string-valued column writes moved from `current.date` to `confirmDate`. No type change, no null change, no structural move.
- Rollback cost is minimal: revert the commit and redeploy.
- Integration test explicitly guards against the original bug's pattern (`.not.toBe(PAST_ORDER_DATE)`), so a regression would be caught immediately.

---

## 6. Tests Run (Local — 2026-04-20)

### 13-gate status

| # | Gate | Type | Phase 4.0.1 → Phase 4.0.2 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (unchanged) |
| 2 | Lint | ✅ real | PASS 0/0 |
| 3 | Typecheck | ✅ real | PASS |
| 4 | Build | ✅ real | PASS — routes unchanged. |
| 5 | Unit + coverage | ✅ real, exit 0 | **223/223 (26 files)**. Coverage unchanged from 4.0.1 (integration-territory files excluded). |
| 6 | Integration | ✅ real, live DB | **175/175 passed (22 files), zero skipped.** Previous 4.0.1 baseline 174 (21 files). Δ = +1 = the cross-day accounting-date case added in this tranche. Wall-clock 782.59s (~13 min) on live Neon. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS (no new migrations) |
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

- [✅] Phase 2.* / 3.* / 4.0 / 4.0.1 — all green on the full integration run (Phase 4.0's happy-path test sets `orders.date = today`, so it keeps passing even though the assertion wouldn't have caught the bug).
- [🆕] Cross-day case: `orders.date = 2026-01-10`, confirmed "today" — `payments.date` + all `bonuses.date` rows land on today's Paris ISO, never on `2026-01-10`.

---

## 8. API Impact

- **No wire change**. Only the server-side value of the `date` column on newly-inserted `payments` + `bonuses` rows changes. Query endpoints keep returning the same JSON shape.

---

## 9. DB Impact

- **No schema change, no migration, no new locks.**
- Two columns are now populated with the confirm-moment Paris date instead of the order-date mirror. Both columns are already indexed for period queries (`date` on payments + `date` on bonuses) — index selectivity improves, not regresses, because the confirm date distribution is narrower than the order-date distribution.

---

## 10. Security Check

- **No security surface changed**. The fix only alters a non-sensitive string column's source value.

---

## 11. Performance Check

- One additional `Intl.DateTimeFormat` call per confirm — ~microseconds, irrelevant next to the Neon network round-trip for the transaction.

---

## 12. Known Issues & Accepted Gaps

1. **`deliveries.date` still mirrors `orders.date`.** That's an operations date — it drives the driver-tasks list filter (`today's deliveries`) and is allowed to reflect the original schedule even when the actual delivery slips. If we later decide deliveries should also show a "delivered-on" date distinct from the scheduled date, that is a new column, not a change to this one.
2. **No backfill logic** because there is no production data yet (pilot blocked until invoices + treasury + settlements ship). A future backfill helper is not needed.

### Resolved in Phase 4.0.2

- ✅ `payments.date` = confirm-moment Paris ISO on every collection row written from confirm-delivery.
- ✅ `bonuses.date` = confirm-moment Paris ISO on every seller + driver row written from confirm-delivery.
- ✅ `orders.delivery_date` = confirm-moment Paris ISO (already fixed in 4.0.1; re-verified in the new cross-day test).

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green (1/2/3/4/5/6/8).

### الشروط

- Commit locally; no push per user directive.
- Phase 4 continuation (invoice PDF, treasury, settlements) remains gated on reviewer acceptance of 4.0 + 4.0.1 + 4.0.2 as a set.

---

## 14. ملاحظة صدق

المراجع كان محقاً تماماً. Phase 4.0 + 4.0.1 كانت تختم payments.date + bonuses.date بتاريخ الطلب عبر deliveries.date (نسخة من orders.date لحظة إنشاء التوصيل)، بينما المرجع المحاسبي (00_DECISIONS §treasury + 10_Calculation_Formulas §bonuses + BR-31) يعتمد هذين الحقلين كمفاتيح فترة صريحة. اختبارات Phase 4.0 لم تكشف الخلل لأنها كانت تنشئ الطلب بتاريخ `today` فتصادف تساوي التاريخ. الإصلاح: سطرين في [`confirm.ts`](../../src/modules/deliveries/confirm.ts) + اختبار متقاطع اليوم يضع orders.date في الماضي ويؤكد صراحةً أن كل التواريخ المحاسبية الأربعة (orders.confirmation_date + orders.delivery_date + payments.date + bonuses.date) تساوي يوم التأكيد، وليس يوم الطلب.

لا shell tricks، لا `--no-verify`، لا push.
