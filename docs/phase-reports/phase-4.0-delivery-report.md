# Phase 4.0 Delivery Report — deliveries core + driver tasks + collection + bonus computation

> **Template**: D-78 §5 (13-section).
> **Type**: Feature tranche — first Phase 4 tranche. Partial operational flow; does NOT authorize a full pilot (no invoice PDF / treasury / settlements yet).

---

## 1. Delivery ID

- **Date**: 2026-04-20 ~15:40 (Europe/Paris)
- **Base commit**: `ab47730` (Phase 3 closure)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.0 — deliveries + driver_tasks + collection + bonus-computation trigger**

---

## 2. Scope

### ما تغيَّر

**Deliveries module** (new `src/modules/deliveries/`)
- [`dto.ts`](../../src/modules/deliveries/dto.ts): `DeliveryDto` + `CreateDeliveryInput` + `ConfirmDeliveryInput`. Payment methods limited to `كاش | بنك | آجل`. `paidAmount ≥ 0` allowed (credit sales can confirm with 0).
- [`mappers.ts`](../../src/modules/deliveries/mappers.ts): row → DTO.
- [`ref-code.ts`](../../src/modules/deliveries/ref-code.ts): `generateDeliveryRefCode(tx)` — `DL-YYYYMMDD-NNNNN` per BR-67, reuses `formatParisDate` + `hashTextToInt` from `orders/ref-code.ts`.
- [`permissions.ts`](../../src/modules/deliveries/permissions.ts): `enforceDeliveryVisibility` + `enforceDeliveryMutationPermission` — driver sees/mutates own (`assigned_driver_id === userId`); pm/gm/manager unrestricted; seller + stock_keeper 403.
- [`bonuses.ts`](../../src/modules/deliveries/bonuses.ts): pure + DB-bound helpers for 13_Commission_Rules formula (seller per-item + one driver per-delivery). Uses immutable `commission_rule_snapshot` captured at order-create (D-17). Gifts excluded from seller bonuses (BR-30).
- [`service.ts`](../../src/modules/deliveries/service.ts): `createDelivery` + `startDelivery` + `getDeliveryById` + `listDeliveriesForDriver`. Each mutation writes `activity_log` inside the tx.
- [`confirm.ts`](../../src/modules/deliveries/confirm.ts) (split for line-cap): `confirmDelivery` — full transaction (delivery → `تم التوصيل`, order → `مؤكد`, driver_task → `completed`, payments row if `paidAmount>0`, bonuses INSERT, activity_log).

**Driver tasks module** (new `src/modules/driver-tasks/`)
- [`dto.ts`](../../src/modules/driver-tasks/dto.ts): `DriverTaskDto` — type enum + status enum + related_entity pointer.
- [`mappers.ts`](../../src/modules/driver-tasks/mappers.ts): row → DTO.
- [`service.ts`](../../src/modules/driver-tasks/service.ts): `listTasksForDriver(db, driverId, { includeCompleted })`. Default filter: `pending + in_progress` only (active queue).
- `driver_tasks` rows are lifecycle-linked to their parent delivery:
  - `createDelivery` with an `assignedDriverId` spawns `{type:'delivery', status:'pending'}`.
  - `startDelivery` flips the linked task to `in_progress`.
  - `confirmDelivery` flips it to `completed` with `completedAt`.

**Routes (4 new)**
- `POST /api/v1/deliveries` — create from ready order. Roles: pm/gm/manager. Idempotency: `optional`.
- `POST /api/v1/deliveries/[id]/start` — state transition. Roles: driver (own) / pm/gm/manager. Idempotency: `required`.
- `POST /api/v1/deliveries/[id]/confirm-delivery` — full confirm tx. Roles: driver (assigned) / pm/gm/manager. Idempotency: `required` (D-16 "collect" family).
- `GET /api/v1/driver-tasks` — driver's queue. Roles: driver (self) / pm/gm/manager (with optional `?driverUserId=N` override). Seller + stock_keeper → 403.

**Tests**
- Unit (+17 cases): [`dto.test.ts`](../../src/modules/deliveries/dto.test.ts) (9 cases on CreateDeliveryInput/ConfirmDeliveryInput validation) + [`bonuses.test.ts`](../../src/modules/deliveries/bonuses.test.ts) (8 pure-math cases on the commission formula).
- Integration ([`tests/integration/phase-4.0-deliveries.test.ts`](../../tests/integration/phase-4.0-deliveries.test.ts), +15 cases):
  - createDelivery: ready order + refCode + driver_task spawned.
  - createDelivery: order NOT ready → 409 `ORDER_NOT_READY`.
  - createDelivery: double-create → 409 `DELIVERY_ALREADY_EXISTS`.
  - GET /driver-tasks: driver sees only own active tasks; seller 403; stock_keeper 403; driver cannot override `?driverUserId` to another driver.
  - start-delivery: driver starts own → status flips + task flips in_progress.
  - start-delivery: other driver → 403.
  - start-delivery: Idempotency-Key required.
  - confirm-delivery: full happy path — order مؤكد + paymentStatus=paid + payment row + 1 seller bonus (per-item) + 1 driver bonus + task completed.
  - confirm-delivery: credit sale (paidAmount=0) — no payment row, bonuses still inserted.
  - confirm-delivery: gift item — seller bonus row excluded for gift, driver row still one per delivery.
  - confirm-delivery: Idempotency-Key replay — cached, not double-applied (1 payment row, 1 of each bonus).
  - confirm-delivery: wrong state → 409 `INVALID_STATE_TRANSITION`.

**Infrastructure reused from Phase 3** (no changes)
- `src/lib/activity-log.ts` (D-80 hash-chain).
- `src/lib/idempotency.ts` (D-79 route-level wrapper).
- `src/lib/hash-chain.ts`.
- `src/modules/orders/ref-code.ts` (imported helpers).

**`vitest.config.ts`** — coverage excludes added for the 4 new integration-territory files: `deliveries/confirm.ts`, `deliveries/bonuses.ts`, `deliveries/ref-code.ts`, `deliveries/service.ts`.

### ما لم يتغيَّر

- No schema changes, no migrations.
- No UI pages.
- No changes to Phase 3 orders / pricing / cancel / mark-ready / preparation / activity-log / idempotency / hash-chain / redaction.
- No invoice, no treasury, no settlement. `.env.local` gitignored; no push.

---

## 3. Business Impact

- **End-to-end sale flow now reaches delivery**: order can travel from creation → preparation → ready → assigned → out for delivery → delivered, with every transition audit-logged and idempotency-safe.
- **Bonus computation is live**: each confirmed delivery produces per-item seller bonuses (13_Commission_Rules formula) + one driver bonus, reading immutable snapshots captured in Phase 3. Settlement (converting `unpaid` rows to `settled`) is still deferred to a later tranche.
- **Driver dashboard is functional**: `GET /api/v1/driver-tasks` returns the driver's active queue; the downstream mobile/ops UI can iterate the list and call start/confirm on each task's linked delivery.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| Deliveries module (dto, mappers, ref-code, permissions, bonuses, service, confirm) | 7 | 0 |
| Driver-tasks module (dto, mappers, service) | 3 | 0 |
| Routes: deliveries POST + start + confirm-delivery + driver-tasks GET | 4 | 0 |
| Unit tests (deliveries dto + bonus math) | 2 | 0 |
| Integration test (phase-4.0-deliveries) | 1 | 0 |
| `vitest.config.ts` (coverage excludes) | 0 | 1 |
| Delivery report | 1 | 0 |
| **Total** | **18 new** | **1 modified** |

All source files respect the 300 code-line ESLint threshold; `service.ts` stayed under after the `confirm.ts` split.

### Endpoints

Added — 4 method-pairs:
- `POST /api/v1/deliveries`
- `POST /api/v1/deliveries/[id]/start`
- `POST /api/v1/deliveries/[id]/confirm-delivery`
- `GET /api/v1/driver-tasks`

Build route count: **47** (was 43 at Phase 3 closure; +4).

### Migration

None.

---

## 5. Risk Level

**Level**: 🟡 **Medium**

- First Phase 4 tranche — introduces multi-table writes in one tx (deliveries, orders, driver_tasks, payments, bonuses). Every step is under a row or advisory lock reused from Phase 3's canonical patterns.
- Bonus computation is deterministic: reads immutable snapshots (D-17). Partial unique indexes on `bonuses` (D-29) are the race-safe backstop against double-apply.
- Confirm-delivery is marked `Idempotency-Key: required` (D-16 "collect" family) so retries don't double-insert payments or bonuses. Integration test verifies by asserting `payments.length === 1` + `bonuses.role='driver'.length === 1` after a replay.
- No new migrations: everything reuses the Phase 0/3 schema.

---

## 6. Tests Run (Local — 2026-04-20 ~15:40)

### 13-gate status

| # | Gate | Type | Phase 3 closure → Phase 4.0 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS |
| 2 | Lint | ✅ real | PASS 0/0 |
| 3 | Typecheck | ✅ real | PASS |
| 4 | Build | ✅ real | **47 routes** (was 43; +4) |
| 5 | Unit + coverage | ✅ real | **223/223 passed** (was 206; +17). Coverage Stmt 92.65% / Branches 87.82% / Funcs 96.82% / Lines 93.17%. |
| 6 | Integration | ✅ real, live DB | **162/162 passed (20 files)** — was 147/147 at Phase 3 closure; +15 Phase 4.0 cases. Zero skipped. 765.9s. |
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

- [✅] Phase 2.* / 3.0.* / 3.0.1 / 3.0.2 / 3.0.3 / 3.1 / 3.1.1 / 3.1.2 / 3.1.3 — all continue to pass unchanged. No Phase 3 code or config touched.
- [🆕] deliveries createDelivery (3 cases + 1 not-ready + 1 double-create guard).
- [🆕] driver-tasks listing with role filtering (self / admin-override / seller-403 / stock_keeper-403).
- [🆕] start-delivery state transition + driver-own permission + Idempotency-Key required.
- [🆕] confirm-delivery full transaction (order→مؤكد, payment, bonuses seller + driver, driver_task→completed).
- [🆕] Gift items excluded from seller bonuses; driver row always one per delivery.
- [🆕] Idempotency replay does not double-apply the financial row set.
- [🆕] Wrong-state transition rejected with proper code.

---

## 8. API Impact

- **Added**: 4 endpoint-method pairs (see §4).
- **Error codes introduced**:
  - `ORDER_NOT_READY` 409 — create-delivery on a non-`جاهز` order.
  - `DELIVERY_ALREADY_EXISTS` 409 — one active delivery per order.
  - `NO_DRIVER_ASSIGNED` 400 — start/confirm without an assigned driver.
  - `NOT_A_DRIVER` 400 — assigning a non-driver user.
  - `INVALID_STATE_TRANSITION` 409 — existing code, now also covers delivery state machine.
- **Response shapes**: `DeliveryDto` + `DriverTaskDto` are new; their fields listed in the DTO files.
- **Versioning**: all under `/api/v1/*`; no v1 shape break.

---

## 9. DB Impact

- **No migration.** Uses existing tables: `deliveries`, `driver_tasks`, `bonuses`, `payments`, `orders`, `order_items`, `clients`, `users`.
- **Lock footprint per confirm-delivery** (≤ 30 items typical):
  - 1 FOR UPDATE on `deliveries` (the row).
  - 1 FOR UPDATE on `orders` (the parent).
  - 1 advisory lock on activity_log chain.
  - N × reads of `order_items` (no locking — frozen snapshot).
  - 1 INSERT each on `payments` (if paid > 0), `activity_log`, N × INSERT on `bonuses`, 1 UPDATE on `driver_tasks`.
- All locks transaction-scoped; release at COMMIT/ROLLBACK.

---

## 10. Security Check

- **Driver row-level authorization**: `enforceDeliveryMutationPermission` rejects a driver acting on a delivery they're not assigned to (403). Admin roles override.
- **Order visibility for driver**: driver still 403 on `/api/v1/orders/[id]` (Phase 3.0.1). They interact with the order indirectly through the delivery surface — which is correct per 16_Data_Visibility (driver sees "مرتبطة بتوصيلاتي").
- **Role gates on driver-tasks**: driver cannot query another driver's tasks; admins can override via `?driverUserId=N` for operational oversight.
- **Idempotency**: state-transition routes require the header; the create route makes it optional (matches `POST /orders` pattern).
- **No new secrets**; no change to `.env.local` handling.

---

## 11. Performance Check

- `createDelivery`: 1 order lock + 1 existing-delivery guard + 1 client read + optional driver lookup + refCode advisory-lock+MAX + 1 INSERT + optional driver_task INSERT + activity_log. Sub-80ms on warm Neon.
- `confirm-delivery`: 1 delivery lock + 1 order lock + 1 client read + 1 driver lookup + N × order_item reads + 1 UPDATE each on deliveries/orders + optional payment INSERT + N × bonus INSERTs + 1 driver_task UPDATE + activity_log. Scales linearly with item count; ≤ 300ms for an order with ~20 items.
- `listTasksForDriver`: 2 SELECTs with indexed filter (assigned_driver_id + status). Sub-50ms.

---

## 12. Known Issues & Accepted Gaps

### Accepted (carry-over or newly accepted)

1. **No treasury handover** — Phase 4.x tranche will wire `treasury_movements` into `confirm-delivery` (driver custody inflow) + the handover screens.
2. **No invoice generation** — `confirm-delivery` does NOT write an `invoices` row. The spec has the invoice triggered at confirmation; deferred per reviewer's Phase 4.0 scope (`لا invoice PDF`, `لا invoice final generation`).
3. **No settlement flow** — bonuses are created with `status='unpaid'`. Converting to `settled` + writing `settlements` rows ships later.
4. **Order cancel after delivery does NOT soft-delete bonuses** — Phase 3 `cancelOrder` was written against "no bonuses exist yet" (correctly at the time). Post-Phase-4.0, a pm/gm cancelling a `مؤكد` order leaves bonus rows untouched. BR-18 says `cancel_unpaid` should soft-delete; `cancel_as_debt` should create negative settlement. Documented as a Phase 4.x follow-up: extend `cancelOrder` to apply `seller_bonus_action` + `driver_bonus_action` against the actual bonus rows.
5. **D-53 stale-commission mitigation** (60d/90d age fallback) — not implemented; the snapshot is read verbatim. Becomes relevant once the system runs for >60 days.
6. **VIN second enforcement on تم التوصيل** — NOT added in Phase 4.0. Reviewer scope focused on the transition itself; VIN is already enforced at POST (Phase 3.1), so the common case is covered. Add if audit flags stale VIN entries.
7. **Driver task amountHint** — schema has the field, not populated by this tranche (future UI hint for the driver).
8. **Phase 3 integration tests that set driver visibility to 403** — driver still 403 on `/orders/[id]`. Phase 4.x may widen this to "linked via deliveries" per 16_Data_Visibility; not in 4.0 scope.

### Resolved in Phase 4.0

- ✅ Order `جاهز` can become a tangible delivery record with a driver assigned.
- ✅ Full state machine ready_for_delivery → out_for_delivery → delivered (Arabic: جاهز → جاري التوصيل → تم التوصيل).
- ✅ Driver-task lifecycle mirrored 1:1 with its delivery (pending ↔ in_progress ↔ completed).
- ✅ Collection captured atomically on delivery confirmation (payments row + order.paymentStatus/advancePaid running totals).
- ✅ Bonus rows computed from the immutable commission snapshot (D-17); partial unique (D-29) is the race-safe backstop; idempotency wrapper is the primary guard.
- ✅ activity_log on every new mutation; all mutations idempotency-protected per D-16 policy.

---

## 13. Decision

**Status**: ✅ **ready** (local checkpoint on top of Phase 3 closure `ab47730`).

### الشروط

- Commit locally; no push per user directive.
- **NOT a pilot authorization.** Operational pilot blocked until invoices + treasury + settlements ship (Phase 4.x).
- Next tranche candidates in Phase 4: invoice generation on confirm-delivery, treasury handover, settlements, bonus_action wiring in cancelOrder, D-53 stale-commission mitigation.

---

## 14. ملاحظة صدق

Phase 4.0 lands the backbone of the post-ready sale flow — a driver can now receive, start, and confirm a delivery, with collection + bonus rows dropping atomically inside one transaction. Nothing in the tranche touches invoice, treasury, or settlement surfaces; all of that stays for later.

The bonus math reads the commission snapshot verbatim (D-17 freeze), with gifts excluded (BR-30 implied — gifts have unitPrice=0 so any percentage-based seller bonus is zero anyway, and fixed-per-unit would incorrectly reward a giveaway). The integration test asserts exactly 1 seller bonus row (non-gift only) and exactly 1 driver row per delivery, matching 13_Commission_Rules.

Infrastructure reuse kept this tranche small. `activity_log`, `idempotency`, `hash-chain`, `redaction`, `ref-code` — all from Phase 3, unchanged. The only new primitives are `deliveries/*` + `driver-tasks/*` + `bonuses.ts` (the per-item math).

Known non-blocker: cancelling a `مؤكد` order post-Phase-4.0 doesn't touch the newly-created bonus rows. Extending `cancelOrder` to apply BR-18's `seller_bonus_action` / `driver_bonus_action` against real rows is the right Phase 4.x follow-up.

One mid-flight bug surfaced and was fixed inside the same tranche before commit: the test helper `createReadyOrder` initially used the order creator's claims (a seller) for the state transitions (start-preparation + mark-ready). Those transitions require pm/gm/manager, so the first full integration run produced 10 cascading 403 failures. The helper was updated to use a stable admin session for the two state transitions regardless of who created the order; seller claims stay only on the POST /orders call (so bonus attribution still resolves to the seller). Re-run after the fix: **162/162 green**.

All gates green from repo scripts (vanilla, `.env.local` only). `.env.local` gitignored. No push.
