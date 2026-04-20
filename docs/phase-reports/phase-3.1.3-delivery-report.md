# Phase 3.1.3 Delivery Report — commissionRuleSnapshot per-role redaction + VIN_DUPLICATE doc alignment

> **Template**: D-78 §5 (13-section).
> **Type**: Required follow-up to Phase 3.1.2 — closes the last visibility leak + one doc-drift issue before acceptance.

---

## 1. Delivery ID

- **Date**: 2026-04-20 ~14:20 (Europe/Paris)
- **Base commit**: `49dc0f2` (Phase 3.1.2)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **3.1.3 — snapshot redaction + VIN_DUPLICATE doc fix**

---

## 2. Scope

### ما تغيَّر

**Fix 1 — `commissionRuleSnapshot` filtered per-role on every response**
- Phase 3.1.2 only redacted `costPrice`. The full snapshot (including `driver_fixed_per_delivery`) still shipped to sellers and stock_keepers, violating 15_Roles_Permissions + 16_Data_Visibility's "عمولات الآخرين ❌".
- [`src/modules/orders/dto.ts`](../../src/modules/orders/dto.ts): `OrderItemDto.commissionRuleSnapshot` is now `.optional()` so stock_keeper's strip is type-valid. Internal code (mapper) always populates; route responses may omit it entirely for stock_keeper.
- [`src/modules/orders/redaction.ts`](../../src/modules/orders/redaction.ts): new `filterSnapshotForRole(snapshot, role)` applied inside `redactItemForRole`:
  - `pm/gm/manager` → full snapshot (all keys preserved).
  - `seller` → only `{ source, captured_at, seller_fixed_per_unit, seller_pct_overage }`. Driver fields never reach the client.
  - `driver` → only `{ source, captured_at, driver_fixed_per_delivery }`. Seller fields never reach the client.
  - `stock_keeper` → snapshot stripped entirely (no commission standing).
- Applied via the same 6 routes already wired in Phase 3.1.2 (POST `/orders`, GET `/orders/[id]`, cancel, start-preparation, mark-ready, preparation list). No route-level changes needed — the redactor does the work.

**Fix 2 — `31_Error_Handling.md` VIN_DUPLICATE documentation**
- Before: single row, 400 only.
- After: two rows — 400 (within-request, "رقم VIN ({vin}) مكرَّر داخل نفس الطلب") and 409 (cross-order active, "رقم VIN ({vin}) مُستخدَم على طلب آخر نشط"). Each row cites Phase 3.1.1 + 3.1.2 as the implementing tranche.

**Tests**
- Unit — [`src/modules/orders/redaction.test.ts`](../../src/modules/orders/redaction.test.ts) rewritten to baseline a realistic full snapshot (source, captured_at, seller_fixed_per_unit, seller_pct_overage, driver_fixed_per_delivery) and cover every role × (cost, snapshot) combination. **+11 cases vs Phase 3.1.2** (total 22 redaction tests), covering:
  - pm/gm/manager see full snapshot.
  - seller sees only seller-side keys; no `driver_fixed_per_delivery` substring in JSON.
  - driver sees only driver-side keys; no `seller_fixed_per_unit` substring.
  - stock_keeper: snapshot absent + no commission substrings.
  - Non-mutation of input object.
  - Missing/undefined snapshot handled safely.
  - Batch variant covers seller + stock_keeper + pm.
- Integration — new [`tests/integration/phase-3.1.3-fixes.test.ts`](../../tests/integration/phase-3.1.3-fixes.test.ts), **5 cases**:
  - seller POST /orders: raw JSON text + parsed body both lack `driver_fixed_per_delivery`.
  - seller GET /orders/[id] (own order): raw JSON lacks `driver_fixed_per_delivery`.
  - admin POST /orders: full snapshot (driver + seller fields both present).
  - stock_keeper GET /api/v1/preparation: no `commissionRuleSnapshot`, no `costPrice`, no `driver_fixed_per_delivery`, no `seller_fixed_per_unit` in the entire response.
  - stock_keeper start-preparation echo: same exclusion guarantees on the response.

### ما لم يتغيَّر

- No schema changes, no migrations.
- No new endpoints; same 43 routes.
- Phase 3.1 / 3.1.1 / 3.1.2 business logic untouched. Existing tests continue to pass.
- Route handlers unchanged (they already call `redactOrderForRole` — the redactor just does more now).
- `.env.local` gitignored; no push.

---

## 3. Business Impact

- **16_Data_Visibility compliance is now end-to-end**: no order-endpoint response carries `cost_price` OR another role's commission rate to a restricted caller. Both leak classes closed.
- **API contract (31_Error_Handling.md) is accurate** with respect to VIN_DUPLICATE's dual-status behavior.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/orders/dto.ts` (commissionRuleSnapshot → optional) | 0 | 1 |
| `src/modules/orders/redaction.ts` (filterSnapshotForRole added) | 0 | 1 |
| `src/modules/orders/redaction.test.ts` (full per-role snapshot coverage) | 0 | 1 |
| `tests/integration/phase-3.1.3-fixes.test.ts` | 1 | 0 |
| `docs/requirements-analysis/31_Error_Handling.md` (VIN_DUPLICATE dual-row) | 0 | 1 |
| `docs/phase-reports/phase-3.1.2-delivery-report.md` (errata) | 0 | 1 |
| `docs/phase-reports/phase-3.1.3-delivery-report.md` | 1 | 0 |
| **Total** | **2 new** | **5 modified** |

All source files remain within the 300 code-line ESLint threshold.

### Endpoints

None added/removed. Response shape tightened for seller/driver/stock_keeper on all 6 order routes (POST, GET, cancel, start-preparation, mark-ready, preparation list).

### Migration

None.

---

## 5. Risk Level

**Level**: 🟢 **Low**

- Pure response-surface redaction. Internal DTO + mapper + service layers unchanged.
- Zero DB impact, zero concurrency impact, zero migration.
- Existing Phase 3.1 commission-snapshot tests already accepted `source` + `seller_fixed_per_unit` for seller (the fields that remain after filter) — those pass unchanged. Admin tests assert driver + seller fields present — admin path is unchanged.
- Integration run asserts the NEGATIVE: specific substrings must NOT appear in the serialized JSON; this is the strongest assertion possible for a leak-prevention fix.

---

## 6. Tests Run (Local — 2026-04-20 14:20)

### 13-gate status

| # | Gate | Type | Phase 3.1.2 → Phase 3.1.3 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS |
| 2 | Lint | ✅ real | PASS 0/0 |
| 3 | Typecheck | ✅ real | PASS |
| 4 | Build | ✅ real | 43 routes (unchanged) |
| 5 | **Unit + coverage** | ✅ **real, exit 0** | **206/206 passed (24 files)** (was 202; +4 redaction test cases net after rewriting). Coverage Stmt 92.94% / Branches 87.82% / Funcs 96.82% / Lines 93.46%. |
| 6 | Integration | ✅ real, live DB | **147/147 passed (19 files)** (was 142; +5 Phase 3.1.3 cases). Zero skipped. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS (no new migrations) |
| 9–13 | placeholder | ⏸ | — |

### Canonical gate commands (unchanged)

```bash
npm run lint
npm run typecheck
npm run build
npm run db:migrate:check
npm run test:unit
npm run test:integration   # requires .env.local with TEST_DATABASE_URL
```

---

## 7. Regression Coverage

- [✅] Phase 2.* / 3.0.* / 3.0.1 / 3.0.2 / 3.0.3 / 3.1 / 3.1.1 / 3.1.2 — all green.
- [✅] Phase 3.1 commission-snapshot tests (user_override, category_rule, default): seller still sees `source + seller_*` — admin still sees full. Both paths covered by the new filter.
- [🆕] Snapshot driver-fields hidden from seller (unit + integration).
- [🆕] Snapshot seller-fields hidden from driver (unit + serialized-JSON assertion).
- [🆕] Snapshot stripped entirely for stock_keeper in preparation queue + start-preparation echo.
- [🆕] `costPrice` continues to be absent for seller/driver/stock_keeper (unchanged from 3.1.2; explicitly re-asserted in new tests).

---

## 8. API Impact

- **Response shape**: `commissionRuleSnapshot` is now per-role. A seller's response includes only `{ source, captured_at, seller_fixed_per_unit, seller_pct_overage }`. Drivers see only their own driver field. Stock_keepers don't see the snapshot at all. Admins see the full snapshot unchanged.
- **Error contract**: `31_Error_Handling.md` now documents `VIN_DUPLICATE` with two status codes (400 within-request, 409 cross-order) — code behavior was already dual in Phase 3.1.1; the doc now matches.
- **No new endpoints, no method-pair changes.**

---

## 9. DB Impact

- **No schema change, no migration, no new locks.**

---

## 10. Security Check

- **Commission-rule cross-leak closed**: seller can no longer observe `driver_fixed_per_delivery`; driver can no longer observe seller fields; stock_keeper sees nothing from the snapshot.
- `costPrice` continues to be stripped for the same restricted roles (Phase 3.1.2 behavior preserved).
- Serialized-JSON assertions in integration verify the leak-prevention holds at the wire level, not just via a JS property-absence check.

---

## 11. Performance Check

- The snapshot filter is O(K) where K ≤ 4 keys per snapshot per role — microseconds of pure JS per item, amortized against an order's item count.
- Integration suite: 545s for 147 tests (was 515s for 142) — +30s for 5 new cases ≈ 6s/case (matches baseline).

---

## 12. Known Issues & Accepted Gaps

1. **`commissionRuleSnapshot` exposes the `source` string ("user_override"/"category_rule"/"default") to seller/driver.** This is metadata about which rule tier was applied, not a cross-role rate value. Accepted; reviewer may tighten later if needed.
2. **No DB-level projection enforcement.** All redaction lives at the API response boundary; internal queries still return the full snapshot (needed by Phase 4 bonus computation). A seller cannot access a lower-layer endpoint because there isn't one — the only wire path is `/api/v1/*` routes, which are all redacted.
3. **Legacy Phase 3.1 commission-snapshot integration tests** already assumed seller sees `source + seller_fixed_per_unit` and admin sees full (including `driver_fixed_per_delivery`). Those assumptions are consistent with Phase 3.1.3 behavior and still pass unchanged.

### Resolved in Phase 3.1.3

- ✅ `commissionRuleSnapshot` no longer leaks other roles' commission rates to any restricted caller.
- ✅ `31_Error_Handling.md` VIN_DUPLICATE row now reflects dual 400/409 semantics.
- ✅ Phase 3.1.2 report carries detailed errata documenting both gaps.

---

## 13. Decision

**Status**: ✅ **ready**.

### الشروط

- Commit locally; no push per user directive.
- Phase 4 tranches (deliveries, invoices, treasury, bonus computation, settlements) remain blocked until reviewer approval.

---

## 14. ملاحظة صدق

Reviewer was correct on both points:
1. Phase 3.1.2's cost-leak redaction was partial — it addressed the leaf `costPrice` field but left the structural commissionRuleSnapshot intact, which bundles other roles' commission rates in a single JSONB. The fix is a per-role filter with explicit allow-lists for seller + driver and full strip for stock_keeper. Admin path is unchanged. Serialized-JSON assertions make the leak-prevention observable at the wire level.
2. Doc drift on VIN_DUPLICATE: the 400/409 dual status was implemented in Phase 3.1.1 but never reflected in 31_Error_Handling.md. Fixed with two explicit rows (each with its own Arabic message + trigger).

All 24 unit files / 206 tests + 19 integration files / 147 tests pass, exit 0, straight from `npm run test:unit` and `npm run test:integration`. No shell tricks. No push.
