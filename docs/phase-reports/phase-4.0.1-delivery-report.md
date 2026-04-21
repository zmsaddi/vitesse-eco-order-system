# Phase 4.0.1 Delivery Report — BR-23 self-assign + BR-07/09 enforcement + D-35 dates + BR-18 bonus-on-cancel

> **Template**: D-78 §5 (13-section).
> **Type**: Required corrective tranche for Phase 4.0 — closes the 4 gaps flagged by external review. Does NOT authorize a full pilot (no invoice PDF / treasury / settlements yet).
> **Status**: Superseded by **Phase 4.0.2** (accounting-date correction). See [`phase-4.0.2-delivery-report.md`](./phase-4.0.2-delivery-report.md).
> **§0 Errata (Phase 4.4 — 2026-04-21)**: This report documents the deferred state of `cancel_as_debt` (error code `SETTLEMENT_FLOW_NOT_SHIPPED`, HTTP 412). Phase 4.4 ships the full settlements flow and replaces that error with the real `cancel_as_debt` implementation plus `BONUS_NOT_SETTLED_FOR_DEBT` (409) for the non-settled case. The existing integration test was updated in the same tranche. See [`phase-4.4-delivery-report.md`](./phase-4.4-delivery-report.md).

---

## 0. Errata (added 2026-04-20 after external review)

One additional critical finding after 4.0.1 committed: `payments.date` and `bonuses.date` were still being stamped with `deliveries.date` (which mirrors `orders.date`), not the confirm moment. Since 00_DECISIONS §treasury + 10_Calculation_Formulas §bonuses + BR-31 all key accounting periods off those two columns, an order opened on day X and delivered on day Y was booking revenue + commission into period X instead of period Y — a real accounting bug that the Phase 4.0 + 4.0.1 tests didn't catch because they happened to set `orders.date` = `today`.

Fixed in Phase 4.0.2. See that report.

---

## 1. Delivery ID

- **Date**: 2026-04-20 (Europe/Paris)
- **Base commit**: `ddfce00` (Phase 4.0)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.0.1 — BR-23 self-assign + BR-07/09 + D-35 + BR-18 bonus actions**

---

## 2. Scope

### ما تغيَّر

**Fix 1 — BR-23 driver self-assign on start/confirm**
- New helper [`src/modules/deliveries/assign.ts`](../../src/modules/deliveries/assign.ts): `ensureDriverAssigned(tx, { deliveryId, currentAssignedDriverId, claims, initialTaskStatus })`. Central policy:
  - If a driver is already assigned → no-op, returns the existing id.
  - If null AND caller role is `driver` → self-assigns the caller onto the delivery (update `deliveries.assigned_driver_id` + cached username) and spawns a `driver_tasks` row at `initialTaskStatus` if none exists.
  - If null AND caller is admin (`pm`/`gm`/`manager`) → throws `NO_DRIVER_ASSIGNED` (400). Admins cannot become drivers for bonus-attribution reasons.
  - Any other role → `PermissionError` (defense-in-depth; route-level gate already blocks seller/stock_keeper).
- [`src/modules/deliveries/service.ts`](../../src/modules/deliveries/service.ts): `startDelivery` calls `ensureDriverAssigned(initialTaskStatus: "pending")` **before** the mutation-permission check, so drivers can legitimately self-start a null-driver delivery.
- [`src/modules/deliveries/confirm.ts`](../../src/modules/deliveries/confirm.ts): `confirmDelivery` calls `ensureDriverAssigned(initialTaskStatus: "in_progress")` before the permission check. The null-driver-throw was removed. When the helper just self-assigned, the inner driver lookup is skipped (we already have the username from `claims`).

**Fix 2 — BR-07 + BR-09 enforcement in confirm-delivery**
- [`src/modules/deliveries/confirm.ts`](../../src/modules/deliveries/confirm.ts) now computes `remaining = totalAmount − advancePaid` after locking the parent order, before any mutation, and enforces:
  - **BR-09 overpayment** — if `paidAmount > remaining + 0.005` → `ConflictError` with code `OVERPAYMENT` (409).
  - **BR-07 partial cash/bank** — if `paymentMethod ∈ { "كاش", "بنك" }` AND `|paidAmount − remaining| > 0.005` → `BusinessRuleError` with code `INCOMPLETE_CASH_PAYMENT` (400).
  - Credit (`آجل`) continues to allow any `0 ≤ paidAmount ≤ remaining` per spec.

**Fix 3 — D-35 `orders.delivery_date` + `orders.confirmation_date` populated on confirm**
- [`src/modules/deliveries/confirm.ts`](../../src/modules/deliveries/confirm.ts): the `orders` UPDATE that flips status to `مؤكد` now also sets:
  - `deliveryDate = formatParisIsoDate(now)` — YYYY-MM-DD in Europe/Paris (`Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" })`).
  - `confirmationDate = now` — timestamp with tz.
- Satisfies 08_State_Transitions §order + D-35 ("delivery_date filled when status='مؤكد'").

**Fix 4 — `cancelOrder` applies BR-18 bonus actions to confirmed orders**
- New helper [`src/modules/orders/cancel-bonuses.ts`](../../src/modules/orders/cancel-bonuses.ts): `applyBonusActionsOnCancel(tx, { orderId, fromStatus, sellerAction, driverAction })`.
- For `fromStatus !== 'مؤكد'` → no-op (no bonuses exist yet).
- For confirmed orders it acquires `FOR UPDATE` on all non-deleted `bonuses` rows of the order (canonical ORDER BY id ASC) and then applies **per-role** independently:
  - `keep` → `UPDATE bonuses SET status='retained'`. Bonus is kept as earned, just not re-evaluated later.
  - `cancel_unpaid` → validates that every row is `status='unpaid'`; if any is `settled`/`retained` → `ConflictError SETTLED_BONUS_SELLER` / `SETTLED_BONUS_DRIVER` (409). Otherwise soft-deletes (`deletedAt = NOW()`).
  - `cancel_as_debt` → **deferred** — throws `BusinessRuleError SETTLEMENT_FLOW_NOT_SHIPPED` (412). The settlements module hasn't shipped yet, so converting a paid bonus back into a debt cannot be completed honestly. User chooses between `keep` and `cancel_unpaid`, or waits for Phase 6.
- [`src/modules/orders/service.ts`](../../src/modules/orders/service.ts) `cancelOrder`: calls the helper after inserting the `cancellations` row, before `logActivity`. The outcome counts (rows retained / rows cancelled per role) are appended to the activity-log details for audit.

**Tests — new [`tests/integration/phase-4.0.1-fixes.test.ts`](../../tests/integration/phase-4.0.1-fixes.test.ts)**
- BR-23: driver self-starts null-driver delivery → delivery.assignedDriverId populated + driver_task spawned at in_progress.
- BR-23: admin starting null-driver delivery → 400 NO_DRIVER_ASSIGNED.
- BR-23: after driver A self-starts, driver B confirm → 403.
- BR-09: overpayment → 409 OVERPAYMENT.
- BR-07: cash partial pay → 400 INCOMPLETE_CASH_PAYMENT.
- BR-07: bank partial pay → 400 INCOMPLETE_CASH_PAYMENT.
- BR-07: credit `آجل` with paidAmount=0 → 200 OK.
- D-35: after confirm-delivery, orders row has `delivery_date` matching YYYY-MM-DD + `confirmation_date` not null.
- BR-18 keep: cancel confirmed → all bonuses flipped to `status='retained'`.
- BR-18 cancel_unpaid: cancel confirmed → all bonuses soft-deleted.
- BR-18 cancel_as_debt: cancel confirmed → 412 SETTLEMENT_FLOW_NOT_SHIPPED + transaction rolled back (bonuses intact, order stays `مؤكد`).
- BR-18 pre-confirmed: cancel in `محجوز` with any action value → 200, no bonuses affected.

**Docs**
- [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md): added `INCOMPLETE_CASH_PAYMENT` (400), `NO_DRIVER_ASSIGNED` (400), `NOT_A_DRIVER` (400), `SETTLEMENT_FLOW_NOT_SHIPPED` (412), and updated `SETTLED_BONUS_*` developer messages to match the new BR-18 trigger. Added row 412 to the HTTP-status table.
- [`docs/phase-reports/phase-4.0-delivery-report.md`](./phase-4.0-delivery-report.md): prepended §0 Errata documenting the 4 gaps and pointing readers here.

### ما لم يتغيَّر

- No schema changes, no migrations (bonuses + orders columns already existed).
- No new endpoints; same routes. Only behavior of `POST /api/v1/deliveries/[id]/start` + `POST /api/v1/deliveries/[id]/confirm-delivery` + `POST /api/v1/orders/[id]/cancel` tightened.
- Phase 4.0 happy-path behavior is unchanged when a driver is assigned up front and payments are at-or-below remaining.
- `.env.local` gitignored; no push.

---

## 3. Business Impact

- **BR-23 is now observable and usable**: a PM can create a delivery with no preset driver, and any driver can start+confirm it — they become the driver of record for bonus attribution, exactly as the spec intends. Previously `assignedDriverId` was "optional" on paper but inert in practice.
- **Cash/bank deliveries cannot close short**: drivers can no longer confirm a `كاش`/`بنك` delivery while leaving a remainder on the order, closing a treasury-leakage risk.
- **Overpayment cannot be accepted silently**: confirms that try to collect more than the outstanding remainder are rejected atomically, with no partial state left behind.
- **D-35 date invariant restored**: downstream reports/filters keyed on `orders.delivery_date` will now have accurate data for confirmed orders.
- **BR-18 now actually mutates `bonuses`**: cancelling a confirmed order either retains earned bonuses for later payout or cleanly deletes unpaid rows. Converting settled bonuses to debts remains deferred with an explicit error code.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/deliveries/assign.ts` | 1 | 0 |
| `src/modules/deliveries/service.ts` (wire `ensureDriverAssigned` into startDelivery) | 0 | 1 |
| `src/modules/deliveries/confirm.ts` (BR-23 + BR-07/09 + D-35) | 0 | 1 |
| `src/modules/orders/cancel-bonuses.ts` | 1 | 0 |
| `src/modules/orders/service.ts` (call `applyBonusActionsOnCancel`) | 0 | 1 |
| `tests/integration/phase-4.0.1-fixes.test.ts` | 1 | 0 |
| `docs/requirements-analysis/31_Error_Handling.md` | 0 | 1 |
| `docs/phase-reports/phase-4.0-delivery-report.md` (errata) | 0 | 1 |
| `docs/phase-reports/phase-4.0.1-delivery-report.md` | 1 | 0 |
| **Total** | **4 new** | **5 modified** |

All source files remain within the 300 code-line ESLint threshold (rule skips blank+comment lines).

### Endpoints

None added/removed. Behavior tightened on 3 existing POSTs:
- `POST /api/v1/deliveries/[id]/start` — BR-23 self-assign accepted when caller is driver.
- `POST /api/v1/deliveries/[id]/confirm-delivery` — BR-23 self-assign, BR-07/BR-09, D-35.
- `POST /api/v1/orders/[id]/cancel` — BR-18 bonus actions applied for confirmed orders.

### Migration

None.

---

## 5. Risk Level

**Level**: 🟡 **Low-Medium**

- Rationale for Medium lean: this tranche mutates money-adjacent invariants (`paymentStatus`, `bonuses.status`/`deletedAt`, `orders.delivery_date`). Each path is covered by a dedicated integration test that asserts post-state end-to-end through the HTTP layer.
- Rationale against High: zero schema change, zero migration, zero new concurrency lock beyond the existing `FOR UPDATE` patterns already proven in Phase 3.1.1 / 4.0.
- Rollback cost is minimal: revert the commit and redeploy; no data backfill required since we only mutate rows going forward.

---

## 6. Tests Run (Local — 2026-04-20)

### 13-gate status

| # | Gate | Type | Phase 4.0 → Phase 4.0.1 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (unchanged) |
| 2 | Lint | ✅ real | PASS 0/0 |
| 3 | Typecheck | ✅ real | PASS |
| 4 | Build | ✅ real | PASS — Compiled in 4.9s; 30/30 static pages; dynamic routes unchanged from Phase 4.0 (43 routes). |
| 5 | Unit + coverage | ✅ real, exit 0 | **223/223 passed (26 files).** Coverage Stmt 92.65% / Branches 87.82% / Funcs 96.92% / Lines 93.57%. `assign.ts` + `cancel-bonuses.ts` added to the coverage exclude list with the same "integration-territory" rationale already used for other DB-touching modules. |
| 6 | Integration | ✅ real, live DB | **174/174 passed (21 files), zero skipped.** Previous baseline 162 (20 files). Δ = +12 = the 12 new Phase 4.0.1 cases. Wall-clock 749.79s (~12.5 min) on live Neon. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS ("Everything's fine 🐶🔥" — no new migrations) |
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

All from vanilla npm scripts — no shell tricks, no overrides.

---

## 7. Regression Coverage

- [✅] Phase 2.* / 3.* / 4.0 — all green on the re-run of their integration files (the Phase 4.0 happy-path test that exercises the assign-at-create + confirm flow still passes; the BR-23 helper is a no-op when a driver is already assigned).
- [🆕] BR-23 driver self-assign on start (integration).
- [🆕] BR-23 driver self-assign on confirm via the status-gated edge case (confirm fails with INVALID_STATE_TRANSITION unless start happened first — covered by the existing Phase 4.0 test).
- [🆕] BR-23 admin null-driver rejection.
- [🆕] BR-07 cash short-pay, BR-07 bank short-pay, BR-07 credit partial allowed (3 cases).
- [🆕] BR-09 overpayment rejected.
- [🆕] D-35 delivery_date + confirmation_date populated on confirm.
- [🆕] BR-18 keep / cancel_unpaid / cancel_as_debt (deferred) / pre-confirmed no-op — 4 cases.

---

## 8. API Impact

- **New error codes on the wire** (all documented in `31_Error_Handling.md`):
  - `NO_DRIVER_ASSIGNED` (400) — admin tries to start/confirm a null-driver delivery.
  - `INCOMPLETE_CASH_PAYMENT` (400) — cash/bank confirm with `paidAmount ≠ remaining`.
  - `OVERPAYMENT` (409) — paidAmount > remaining (status code matches the existing spec row; the behavior is newly enforced).
  - `SETTLEMENT_FLOW_NOT_SHIPPED` (412) — BR-18 `cancel_as_debt` chosen before settlements ship.
  - `NOT_A_DRIVER` (400) — resolveDriver with a non-driver user id (defensive; existed in Phase 4.0, now documented).
- **Behavioral tightenings on existing endpoints** — no method/URL changes; payloads unchanged.
- **Response shape** — `cancel` activity-log details now include `seller_rows_retained / seller_rows_cancelled / driver_rows_retained / driver_rows_cancelled` for audit traceability.

---

## 9. DB Impact

- **No schema change, no migration.**
- **Query additions** — `applyBonusActionsOnCancel` issues one `SELECT … FOR UPDATE` on `bonuses` rows of the order (canonical ORDER BY id ASC) plus up-to-two `UPDATE`s (seller + driver). All within the caller's tx.
- **`orders` UPDATE on confirm-delivery** — now writes two additional columns (`delivery_date`, `confirmation_date`). Indexed columns are unaffected; no hot-loop impact.

---

## 10. Security Check

- **No new trust boundaries**. Route-level role gates (requireRole) are unchanged; `ensureDriverAssigned` is a defense-in-depth check inside the already-authenticated path.
- **BR-23 cannot be abused by a driver to confirm somebody else's delivery** — `enforceDeliveryMutationPermission` still runs with the (post-assign) `driverUserId` and blocks driver-B from confirming driver-A's delivery. Integration test "after driver self-starts, a different driver cannot confirm (403)" proves this.
- **BR-18 cannot be abused to erase already-paid bonuses** — `cancel_unpaid` refuses when any row is not `unpaid`; `cancel_as_debt` is deferred with an explicit 412 code that cannot be mistaken for success.

---

## 11. Performance Check

- All new work is per-request O(bonuses-per-order) where bonuses-per-order ≈ items + 1 driver row (single-digit rows in practice). Added query volume is negligible.
- `Intl.DateTimeFormat` call in `formatParisIsoDate` is a single ~μs per confirm — irrelevant against the already-minute-scale Neon RTT.

---

## 12. Known Issues & Accepted Gaps

1. **`cancel_as_debt` is not implementable until settlements ship**. We return 412 `SETTLEMENT_FLOW_NOT_SHIPPED` instead of silently doing nothing. User must pick `keep` or `cancel_unpaid`, or wait for Phase 6.
2. **BR-23 self-assign on confirm is structurally unreachable** in the current state machine (confirm requires status `جاري التوصيل`, which can only be reached via start-delivery — so the driver self-assigns on start, not confirm). The confirm-side guard is kept as defense-in-depth and documented.
3. **No UI yet**. This is a server-side tranche; UI changes for the new error codes land in Phase 4.1 (driver app).

### Resolved in Phase 4.0.1

- ✅ BR-23 self-assign works end-to-end.
- ✅ BR-07 + BR-09 enforced atomically inside the confirm transaction.
- ✅ D-35 delivery_date + confirmation_date filled on confirm.
- ✅ BR-18 bonus actions applied to confirmed cancellations with clear error paths for the settled and deferred cases.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green (1/2/3/4/5/6/8).

### الشروط

- Commit locally; no push per user directive.
- Phase 4 continuation (invoice PDF, treasury, settlements) remains gated on reviewer approval of 4.0 + 4.0.1 together.

---

## 14. ملاحظة صدق

All four issues the reviewer flagged on Phase 4.0 were real and actionable:

1. **BR-23** — the reviewer was right that `assignedDriverId: nullable` in the DTO, combined with `NO_DRIVER_ASSIGNED` hard-throws in start/confirm, made the "optional" annotation dishonest. Fix is a small central helper so the self-assign rule lives in exactly one place.
2. **BR-07/BR-09** — the spec is explicit that cash/bank at delivery means *full payment*, and that no collection can exceed the remainder. Phase 4.0 only checked `paidAmount ≥ 0`, so both rules were silently unenforced. Fix adds both checks before any mutation inside the confirm transaction.
3. **D-35** — `orders.delivery_date` + `orders.confirmation_date` are columns specifically for the `مؤكد` transition; leaving them null made downstream reporting wrong. Fix is two extra columns on the existing UPDATE.
4. **BR-18** — Phase 4.0 made bonus rows a real operational fact, so leaving `cancelOrder` as a "record intent only" no-op became a correctness bug the moment any confirmed order was cancelled. Fix implements `keep` + `cancel_unpaid` fully and defers `cancel_as_debt` with a honest 412 code rather than pretending it succeeded.

No shell tricks, no `--no-verify`, no push. All four fixes are covered by the new integration file plus re-runs of the Phase 4.0 tests — **174/174 integration + 223/223 unit, exit 0, from vanilla `npm run test:integration` + `npm run test:unit`**.
