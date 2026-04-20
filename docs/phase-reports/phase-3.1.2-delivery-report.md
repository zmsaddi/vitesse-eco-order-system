# Phase 3.1.2 Delivery Report — Seller cost hiding + VIN normalization + race-safe VIN lock

> **Template**: D-78 §5 (13-section).
> **Type**: Required follow-up to Phase 3.1.1 — closes the last 3 reviewer-flagged gaps in the VIN + data-visibility story.

---

## 1. Delivery ID

- **Date**: 2026-04-20 ~13:55 (Europe/Paris)
- **Base commit**: `9b25320` (Phase 3.1.1)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **3.1.2 — post-Phase-3.1.1 critical fixes**

---

## 2. Scope

### ما تغيَّر

**Fix 1 — Hide `costPrice` from seller/driver/stock_keeper on the response surface**
- [`src/modules/orders/dto.ts`](../../src/modules/orders/dto.ts): `OrderItemDto.costPrice` is now `.optional()`. Internal callers still populate it via the mapper; the public wire shape omits it for the restricted roles.
- New [`src/modules/orders/redaction.ts`](../../src/modules/orders/redaction.ts):
  - `redactOrderForRole(order, role)` — deep-clones the order, drops `costPrice` from every item when the caller is seller/driver/stock_keeper. Non-mutating (asserted by unit test).
  - `redactOrdersForRole(orders, role)` — batch variant for the preparation queue.
  - Pure function, no DB. Applied at the route boundary so the idempotency-cached body is already redacted on replay.
- Wired into 6 routes:
  - `POST /api/v1/orders` → `{ order: redactOrderForRole(order, claims.role) }`.
  - `GET /api/v1/orders/[id]` → same.
  - `POST /api/v1/orders/[id]/cancel` → same.
  - `POST /api/v1/orders/[id]/start-preparation` → same.
  - `POST /api/v1/orders/[id]/mark-ready` → same.
  - `GET /api/v1/preparation` → `{ orders: redactOrdersForRole(rows, claims.role), total }`.
- Per 16_Data_Visibility the redacted roles are seller + driver + stock_keeper. pm/gm/manager see the full DTO.

**Fix 2 — VIN normalization end-to-end**
- New `normalizeVin(raw)` helper in [`locks.ts`](../../src/modules/orders/locks.ts): `(raw ?? "").trim().toLowerCase()`. One canonical function used by all VIN code paths.
- [`pricing.ts`](../../src/modules/orders/pricing.ts) `processOrderItem`: stores `input.vin.trim()` — whitespace stripped before the DB INSERT. Case is preserved for display; only compare is case-insensitive.
- [`locks.ts`](../../src/modules/orders/locks.ts) `assertNoDuplicateVinWithinRequest`: now calls `normalizeVin()` directly.
- [`locks.ts`](../../src/modules/orders/locks.ts) `assertNoDuplicateVinAcrossOrders`: cross-order SQL match is now `LOWER(TRIM(${orderItems.vin}))` (was `LOWER(...)` without TRIM). Catches " VIN-123 " vs "VIN-123" collisions.

**Fix 3 — Race-safe VIN via advisory_xact_lock**
- [`acquireOrderCreateLocks(tx, items)`](../../src/modules/orders/locks.ts) now takes a third lock tier AFTER products + gift_pool:
  ```
  for each unique normalized VIN in the payload (sorted ASC):
    SELECT pg_advisory_xact_lock(hashtext('vin:' || normalized))
  ```
- Keyed on `"vin:" + normalizedVin` (prefix avoids collision with other advisory-lock namespaces: activity_log chain = 1_000_001, cancellations = 1_000_002, idempotency-keys = `hashtext(key||endpoint)`, refCode = `hashtext(prefix|day)`).
- Two concurrent createOrders with disjoint products but the same VIN now serialize on the VIN lock; the later one sees the committed row via the cross-order query and is rejected with `VIN_DUPLICATE` 409.
- Deterministic order (sorted ASC) preserves the Phase 3.1.1 deadlock-freedom property: two tx's that share any VINs always take them in identical order.

**Tests**
- Unit: new [`src/modules/orders/redaction.test.ts`](../../src/modules/orders/redaction.test.ts) — 11 cases exercising redaction for every role, non-mutation, JSON-serialization absence of `costPrice`/`50` for seller, admin-preserved costs, batch variant.
- Integration: new [`tests/integration/phase-3.1.2-fixes.test.ts`](../../tests/integration/phase-3.1.2-fixes.test.ts) — 7 cases:
  - seller POST /orders response body has NO `costPrice` (asserted on raw JSON text + parsed body).
  - seller GET /orders/[id] for own order has NO `costPrice`.
  - admin POST /orders response DOES include `costPrice`.
  - stored VIN is `trim()`'d.
  - VIN with whitespace + casing variant detected as duplicate → 409.
  - Concurrent POSTs with disjoint products + same VIN → exactly one 201 + one 409.
  - Concurrent POSTs with disjoint products + different VINs both 201.

### ما لم يتغيَّر

- No schema changes, no migrations.
- No new endpoints; same 43 routes.
- No changes to auth, middleware, Phase 2.* logic, Phase 3.0.* logic, Phase 3.1 pricing logic beyond the VIN storage trim.

---

## 3. Business Impact

- **Seller data-visibility is now compliant end-to-end**: no route surfaces `cost_price` to seller (or driver or stock_keeper). Every existing Phase 3.1 test that asserts on the full DTO still passes because admin tests continue to see cost.
- **VIN dedup works for real**: the " VIN-123 " vs "VIN-123" bypass is closed, and the concurrent-creates-with-different-products race is closed by the advisory lock. The invariant is now enforceable at scale.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/orders/redaction.ts` + unit test | 2 | 0 |
| `src/modules/orders/dto.ts` (costPrice → optional) | 0 | 1 |
| `src/modules/orders/locks.ts` (normalizeVin + VIN advisory lock + LOWER(TRIM)) | 0 | 1 |
| `src/modules/orders/pricing.ts` (trim VIN on storage) | 0 | 1 |
| 6 order routes (import + redact) | 0 | 6 |
| `tests/integration/phase-3.1.2-fixes.test.ts` | 1 | 0 |
| `docs/phase-reports/phase-3.1.1-delivery-report.md` (errata) | 0 | 1 |
| `docs/phase-reports/phase-3.1.2-delivery-report.md` (new) | 1 | 0 |
| **Total** | **4 new** | **10 modified** |

All source files remain within the 300 code-line ESLint threshold.

### Endpoints

No additions. 6 order routes modified to call `redactOrderForRole`/`redactOrdersForRole` before returning.

### Migration

None.

---

## 5. Risk Level

**Level**: 🟢 **Low**

- Redaction is a pure projection over a DTO — zero behavioral effect on the internal service or DB.
- VIN trim on storage is a single `.trim()` call; the integration test proves it with a whitespace-input assertion.
- VIN advisory lock is additive to the existing product+gift_pool chain; deterministic ordering (sorted ASC) preserves deadlock-freedom.
- Full 142/142 integration suite passes twice in a row on live Neon (verified cold-start flakiness is transient; two consecutive clean runs confirm stability).

---

## 6. Tests Run (Local — 2026-04-20 13:55)

### 13-gate status

| # | Gate | Type | Phase 3.1.1 → Phase 3.1.2 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS |
| 2 | Lint | ✅ real | PASS 0/0 |
| 3 | Typecheck | ✅ real | PASS |
| 4 | Build | ✅ real | 43 routes (unchanged) |
| 5 | **Unit + coverage** | ✅ **real, exit 0** | **202/202 passed (24 files)** (was 191; +11 from redaction suite). Coverage Stmt 92.79% / Branches 89.1% / Funcs 96.82% / Lines 93.46% — above 70% thresholds. |
| 6 | Integration | ✅ real, live DB | **142/142 passed (18 files)** (was 135; +7 Phase 3.1.2 cases). Zero skipped. Two consecutive clean runs. |
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

No shell tricks, no custom flags, no environment setup beyond `.env.local`.

### Integration stability

- Run 1: 1 failed file / 2 failed tests / 140 passed (one Neon cold-start timeout early in the run, not related to the fixes).
- Run 2: 18 files / 142 tests — all green.
- Run 3: 18 files / 142 tests — all green.
Two consecutive clean runs treated as the acceptance signal.

---

## 7. Regression Coverage

- [✅] All Phase 2.* / 3.0.* / 3.0.1 / 3.0.2 / 3.0.3 / 3.1 / 3.1.1 cases — unchanged.
- [🆕] seller POST /orders: no costPrice in response (raw text + parsed body).
- [🆕] admin POST /orders: costPrice present.
- [🆕] seller GET /orders/[id] (own): no costPrice.
- [🆕] VIN stored trimmed.
- [🆕] VIN case+whitespace variant detected as duplicate cross-order.
- [🆕] Concurrent disjoint-products + same VIN: exactly one 201 + one 409.
- [🆕] Concurrent disjoint-products + different VINs: both 201.

---

## 8. API Impact

- **Response shape**: `OrderItemDto.costPrice` is now optional; seller/driver/stock_keeper responses omit the field entirely (not `null`, missing). Admin/manager responses still include it as before. No breaking change for existing admin-only consumers; seller-side consumers that expected the field were leaking data and must not rely on it.
- **Error codes**: `VIN_DUPLICATE` (new in Phase 3.1.1) semantics unchanged; normalization + race-lock make it correctly triggered in more scenarios.
- **No new endpoints, no method-pair changes.**

---

## 9. DB Impact

- **No schema change, no migration.**
- **Stored data**: new rows store `vin` trimmed (whitespace stripped, case preserved). Existing rows with whitespace in `vin` remain as-is; queries now `LOWER(TRIM(...))` so they participate in dedup correctly. No data migration required.
- **Lock footprint per createOrder** (with M items containing V unique VINs):
  - 1 bulk FOR UPDATE on products (1 SELECT for N product rows).
  - Optional 1 bulk FOR UPDATE on gift_pool (1 SELECT for G gift rows).
  - V × `pg_advisory_xact_lock(hashtext('vin:' || ...))` calls.
  - All transaction-scoped; released at COMMIT/ROLLBACK.

---

## 10. Security Check

- **16_Data_Visibility compliance (cost_price)**: seller + driver + stock_keeper cannot see `cost_price` on any order-surface endpoint. Verified by raw-JSON text assertion (no "costPrice" substring) + parsed-body field absence.
- **VIN anti-tamper**: whitespace evasion closed; case variant evasion closed. Dedup cannot be bypassed by a careful attacker formatting strings.
- **Concurrency invariant**: under DoS-style parallel POSTs, two orders can no longer both insert the same VIN.
- `.env.local` still gitignored (`git check-ignore` confirms).

---

## 11. Performance Check

- Redaction: O(items × fields) pure-JS shallow clone per response. Negligible (< 1ms for any realistic item count).
- Integration run time: ~515s for 142 tests (was ~470s for 135 in 3.1.1) — ~45s for 7 new cases, ≈ 6.5s/case (consistent with prior suites).
- Unit run time: ~3s (unchanged, coverage summary identical).
- VIN advisory locks: 1 extra lock per unique VIN in the payload. Typical orders have 0-5 VINs (VIN applies to bikes only). Sub-millisecond lock acquisition on warm connections.

---

## 12. Known Issues & Accepted Gaps

1. **No DB-level UNIQUE INDEX on `LOWER(TRIM(order_items.vin))`** — app-level check + cross-order dedup + advisory lock cover the hot paths. A partial functional unique index would be defense-in-depth but is blocked by the fact that "active" depends on the parent `orders.status` (different table). A CHECK/trigger-based enforcement would be required and adds migration complexity. Deferred.
2. **commissionRuleSnapshot** is NOT currently redacted for seller. It includes the seller's own commission rates (`seller_fixed_per_unit`, `seller_pct_overage`) — arguably visible-to-self per role rules. If a future spec tightens this, extend `redactItemForRole` to strip the snapshot for seller too.
3. **Driver role is currently 403 on all order endpoints** (Phase 3.0.1). Redaction for driver is therefore untested in practice; the code path exists for defense-in-depth when Phase 4 delivery-linkage unblocks driver visibility.
4. **Preparation queue redaction** applies to stock_keeper's own view; pm/gm/manager see cost. Matches 16_Data_Visibility exactly.

### Resolved in Phase 3.1.2

- ✅ `costPrice` never reaches seller/driver/stock_keeper via any order endpoint (POST, GET, cancel, start-preparation, mark-ready, preparation list).
- ✅ VIN normalized canonically on both storage (trim) and compare (LOWER(TRIM)) — whitespace bypass closed.
- ✅ Concurrent same-VIN creates serialize on advisory lock regardless of product overlap — race closed.
- ✅ Phase 3.1.1 report carries detailed errata documenting the three gaps.

---

## 13. Decision

**Status**: ✅ **ready**.

### الشروط

- Commit locally; no push per user directive.
- Phase 4 tranches still blocked until reviewer approval.

---

## 14. ملاحظة صدق

Reviewer was precise on all three points:
1. I closed only the error-path leak in 3.1.1; the DTO itself still carried `costPrice` on every successful seller response. Redaction at the route boundary is the correct fix and is tested both at the raw-JSON and structured level.
2. VIN storage used the raw string; the compare used only LOWER without TRIM. " VIN-123 " bypass was real. `normalizeVin()` + server-side `LOWER(TRIM(...))` + storage-side `trim()` close the gap. One canonical function is used everywhere.
3. Product locks didn't serialize two tx's whose product sets were disjoint. An advisory lock keyed on the normalized VIN is the minimal guarantee that matches the existing advisory-lock pattern used elsewhere in the codebase (activity_log chain, cancellations chain, idempotency keys, refCode). Integration test with `Promise.all` on disjoint products + same VIN now produces `[201, 409]` deterministically.

All 24 unit files / 202 tests + 18 integration files / 142 tests pass, exit 0, straight from `npm run test:unit` and `npm run test:integration`. No shell tricks. No push.
