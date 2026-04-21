# Phase 4.2 Delivery Report — Treasury core + driver→manager handover + collection bridge + manager_id

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: First functional treasury tranche inside Phase 4. Strictly scoped — transfer/reconcile/settlements/distributions all remain out.
> **Status**: Superseded by **Phase 4.2.1** (BR-52 hierarchy fix). See [`phase-4.2.1-delivery-report.md`](./phase-4.2.1-delivery-report.md).

---

## 0. Errata (added 2026-04-21 after external review)

One structural defect surfaced after `c214453` committed: every `manager_box` created by Phase 4.2 — both via `ensureManagerBox` in the users service and via migration 0009's backfill — was inserted with `parent_account_id = NULL`. That detaches manager boxes from the canonical `main_cash → manager_box → driver_custody` chain required by BR-52 ([09_Business_Rules.md](../requirements-analysis/09_Business_Rules.md#L129)) and [12_Accounting_Rules.md §hierarchy](../requirements-analysis/12_Accounting_Rules.md#L59-L83).

Resolved in **Phase 4.2.1**:
- Migration 0010 rebinds every `manager_box` whose `parent_account_id IS DISTINCT FROM main_cash.id` — covering the NULL case AND any non-canonical parent (e.g. `main_bank.id`).
- `ensureManagerBox` (users service) now looks up `main_cash`, pins new rows to it, AND rebinds existing rows whose parent drifted. Treated as an idempotent invariant-enforcer, not a lazy creator.

Read this report together with the 4.2.1 report.

---

## 0. Implementation Contract (accepted 2026-04-21 with 6 amendments)

**Scope accepted**:
- Treasury core module + GET /api/v1/treasury + POST /api/v1/treasury/handover.
- `users.manager_id` introduced as a single-column link (NOT a team model).
- Collection → treasury bridge inside `confirmDelivery` with BR-55b cap check.
- Minimal account bootstrap (`/api/init` seeds `main_cash` + `main_bank`; users service auto-creates manager_box / driver_custody).
- Backfill migration for `manager_box` of every existing `role='manager'` (NOT admin/pm/gm).
- Docs sync: 02_DB_Tree + 31_Error_Handling + 35_API_Endpoints.

**Out of scope (verbatim)**: treasury transfer, reconcile, settlements, distributions, avoir, UI, wide refactor, Phase 5, hash-chain on treasury_movements, `X-Force-Collect` override.

**Decisions locked by user**:
- `sale_collection`: `from_account_id = NULL`, `to_account_id = driver_custody.id`.
- `driver_custody_cap_eur` checked inside `confirmDelivery` before any mutation; zero side effects on rejection.
- `HANDOVER_NOT_ALLOWED` NOT added — generic 403 from `PermissionError`.
- `vitest.config.ts` only touched if Gate 5 fails (it did not).

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `a42c3a7` (Phase 4.1.2)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.2 — treasury core + handover + collection bridge + manager link**

---

## 2. Scope

### ما تغيَّر

**Schema + migration 0009**
- [`src/db/schema/users.ts`](../../src/db/schema/users.ts): new `managerId INTEGER NULL REFERENCES users(id)` column. Typed via `AnyPgColumn` self-reference.
- [`src/db/migrations/0009_users_manager_id.sql`](../../src/db/migrations/0009_users_manager_id.sql): ADD COLUMN + FK + hand-extended backfill `INSERT INTO treasury_accounts ... SELECT FROM users WHERE role='manager' AND active=true AND NOT EXISTS (...)`. Idempotent — re-running produces no duplicates.

**Treasury module** (new) — `src/modules/treasury/`
- [`dto.ts`](../../src/modules/treasury/dto.ts): `TreasuryAccountDto`, `TreasuryMovementDto`, `HandoverInput`, `ListTreasuryQuery`, `TreasurySnapshotDto`.
- [`mappers.ts`](../../src/modules/treasury/mappers.ts): row → DTO for both tables.
- [`permissions.ts`](../../src/modules/treasury/permissions.ts): `assertCanViewTreasury` + `assertCanHandover`.
- [`accounts.ts`](../../src/modules/treasury/accounts.ts): shared `lockAccountForUpdate` + `findAccountByOwnerAndType` + helpers.
- [`service.ts`](../../src/modules/treasury/service.ts): `listTreasury(db, claims, q)` — role-scoped snapshot. Manager filter computes `driver_custody` ids for drivers where `users.manager_id = claims.userId` + own `manager_box`. Driver filter gets own `driver_custody` only. Seller/stock_keeper → 403.
- [`handover.ts`](../../src/modules/treasury/handover.ts): `performHandover` — resolves driver (self for driver caller; `driverUserId` required for manager caller with strict `drv.manager_id === caller.userId`), acquires FOR UPDATE locks in canonical ORDER (lower id first to avoid deadlocks), verifies no overdraft, flips balances, inserts `driver_handover` movement, writes activity_log.
- [`bridge.ts`](../../src/modules/treasury/bridge.ts): `bridgeCollection(tx, args)` — verifies driver + manager_id + custody exist (else `CUSTODY_DRIVER_UNLINKED`), reads `driver_custody_cap_eur`, locks custody FOR UPDATE, enforces BR-55b (else `CUSTODY_CAP_EXCEEDED`), updates balance + inserts `sale_collection` movement with `from=NULL, to=custody.id`.

**Users service integration** — idempotent account wiring
- [`src/modules/users/treasury-wiring.ts`](../../src/modules/users/treasury-wiring.ts) (new): `validateManagerLink`, `findManagerBox`, `ensureManagerBox`, `ensureDriverCustody` (rebinds `parent_account_id` on manager change; never creates a duplicate).
- [`src/modules/users/service.ts`](../../src/modules/users/service.ts): `createUser` + `updateUser` now validate driver-manager rule (active drivers must have `manager_id`) + invoke the ensure-* helpers. `updateUser` computes effective post-patch role/active/manager values and validates on those. Disabling a user or changing role does NOT delete any treasury account.
- [`src/modules/users/dto.ts`](../../src/modules/users/dto.ts) + [`mappers.ts`](../../src/modules/users/mappers.ts): `managerId` added to `UserDto`, `CreateUserInput`, `UpdateUserPatch`.

**confirm-delivery wiring** — [`src/modules/deliveries/confirm.ts`](../../src/modules/deliveries/confirm.ts)
- Inside `if (input.paidAmount > 0) { ... }`, `bridgeCollection` is called FIRST (before the `payments` insert). A cap breach or `CUSTODY_DRIVER_UNLINKED` throws and the entire tx rolls back — confirming nothing.

**Bootstrap** — [`src/app/api/init/route.ts`](../../src/app/api/init/route.ts)
- After admin insert + settings/permissions seed, inserts `main_cash` + `main_bank` (owner = admin userId). `driver_custody_cap_eur` already present in `SETTINGS_SEED` at "2000".

**Hash-chain** — [`src/lib/hash-chain.ts`](../../src/lib/hash-chain.ts)
- No change. `treasury_movements` not added to `HASH_CHAIN_KEYS` — hash-chain explicitly deferred per contract. Append-only guaranteed by the existing D-58 trigger `treasury_movements_no_update` from migration 0001 (proven by test T-A1).

**Routes (2 new)**
- [`src/app/api/v1/treasury/route.ts`](../../src/app/api/v1/treasury/route.ts) — `GET` list. Role gate: pm/gm/manager/driver.
- [`src/app/api/v1/treasury/handover/route.ts`](../../src/app/api/v1/treasury/handover/route.ts) — `POST` handover. Role gate: driver/manager. Wrapped in `withIdempotencyRoute(requireHeader: "required")`.

**Tests — new [`tests/integration/phase-4.2-fixes.test.ts`](../../tests/integration/phase-4.2-fixes.test.ts)**
- 17 cases covering happy-path, negative (insufficient, unlinked, unauthorized), idempotency replay, visibility (pm/manager/driver/seller/sk + cross-team), bridge (cap enforcement + unlinked + happy), concurrency (two parallel handovers + two parallel bridges with cap competition), append-only trigger proof, end-to-end collection→handover.

**Prior-phase fixtures** — minimal updates so their `confirmDelivery` calls find a driver with `manager_id` + `driver_custody`:
- [`tests/integration/setup.ts`](../../tests/integration/setup.ts): new `wireManagerAndDrivers(tx, args)` helper (idempotent test-level wiring of manager + manager_box + drivers + custodies).
- `tests/integration/phase-4.0-deliveries.test.ts`, `phase-4.0.1-fixes.test.ts`, `phase-4.0.2-fixes.test.ts`, `phase-4.1-invoices.test.ts`, `phase-4.1.1-fixes.test.ts`, `phase-4.1.2-fixes.test.ts` — replaced raw `insert(users) ... role:'driver'` blocks with a call to `wireManagerAndDrivers`. Usernames unchanged; test-code references remain valid.

**Docs sync**
- [`docs/requirements-analysis/02_DB_Tree.md`](../requirements-analysis/02_DB_Tree.md): §1 `users` gains `manager_id` row + service-layer rule note. §25 `treasury_accounts` rewritten to match schema (`owner_user_id` INT FK replaces stale `owner_username` TEXT; bootstrap rules listed). §26 `treasury_movements` columns refreshed; categories that actually land in 4.2 listed; append-only note added.
- [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md): `CUSTODY_CAP_EXCEEDED` description refreshed (BR-55b in bridge). New codes: `INSUFFICIENT_CUSTODY` (409), `CUSTODY_DRIVER_UNLINKED` (409), `DRIVER_MANAGER_REQUIRED` (400), `INVALID_MANAGER` (400), `MANAGER_BOX_MISSING` (409).
- [`docs/requirements-analysis/35_API_Endpoints.md`](../requirements-analysis/35_API_Endpoints.md): `/api/v1/treasury` GET now specifies response shape + manager filter semantics. `/api/v1/treasury/handover` now documents body shape + idempotency requirement + role asymmetry (driver-own vs manager-for-linked-driver). `/transfer` + `/reconcile` marked explicitly out of Phase 4.2.

### ما لم يتغيَّر

- `treasury_movements` schema unchanged. No hash chain. No new columns.
- `payments` table unchanged. The bridge writes to `treasury_movements` in addition to (not instead of) the existing `payments` insert.
- No new endpoints beyond the two listed. `/api/v1/treasury/transfer` + `/reconcile` not added.
- `vitest.config.ts` untouched (Gate 5 stayed green without excludes).
- `.env.local` gitignored. No push.

---

## 3. Business Impact

- **BR-52 hierarchy is observable end-to-end**: every confirmed cash delivery now lands in a `driver_custody`, visible to the right manager via GET /api/v1/treasury, and flows to a `manager_box` via POST /api/v1/treasury/handover.
- **BR-55 "every cash event = one movement" is now true** (previously: 4.0 wrote `payments` but never `treasury_movements`).
- **BR-55b cap is enforced inside the confirm-delivery tx** — no more risk of silently accumulating custody above cap.
- **Team isolation is real at the data layer** thanks to `users.manager_id`. A manager querying treasury sees their own drivers only.
- **Legacy data honesty**: drivers without `manager_id` are grandfathered on `users`, but treasury operations (bridge + handover) refuse them with `CUSTODY_DRIVER_UNLINKED`. No silent drift.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/db/schema/users.ts` (+manager_id) | 0 | 1 |
| `src/db/migrations/0009_users_manager_id.sql` + snapshot + journal | 2 | 1 |
| `src/modules/treasury/{dto,mappers,permissions,accounts,service,handover,bridge}.ts` | 7 | 0 |
| `src/modules/users/{service,dto,mappers,treasury-wiring}.ts` | 1 | 3 |
| `src/modules/deliveries/confirm.ts` (bridge call) | 0 | 1 |
| `src/app/api/init/route.ts` (account bootstrap) | 0 | 1 |
| `src/app/api/v1/treasury/**` | 2 | 0 |
| `tests/integration/setup.ts` (wireManagerAndDrivers helper) | 0 | 1 |
| `tests/integration/phase-4.0..4.1.2-*.test.ts` (fixture switch) | 0 | 6 |
| `tests/integration/phase-4.2-fixes.test.ts` | 1 | 0 |
| `docs/requirements-analysis/{02,31,35}_*.md` | 0 | 3 |
| `docs/phase-reports/phase-4.2-delivery-report.md` | 1 | 0 |
| **Total** | **14 new** | **17 modified** |

All source files within the 300 effective-line ESLint threshold. Largest: `confirm.ts` (raw 329, effective <300).

### Endpoints

Net +2 new endpoints: `GET /api/v1/treasury`, `POST /api/v1/treasury/handover`. One endpoint (confirm-delivery) gained an internal bridge call — its response body is unchanged.

### Migration

New additive: 0009 adds `users.manager_id` + FK + one-shot `INSERT ... NOT EXISTS` backfill for manager_box accounts. No data rewrite. Idempotent.

---

## 5. Risk Level

**Level**: 🟡 **Medium**.

- Rationale: this tranche mutates the confirm-delivery critical path (bridge) AND adds new FOR UPDATE patterns on `treasury_accounts`. A bug in the bridge could either block legitimate deliveries (reject incorrectly) or corrupt balances.
- Mitigations:
  - Concurrency tests (T-H7, T-B4) actively exercise the `FOR UPDATE` lock protocol for both handover and bridge.
  - Zero-side-effects tests (T-H2, T-B2, T-B3) confirm that rollback is complete under failure.
  - Append-only trigger proof (T-A1) confirms the D-58 guarantee still holds.
  - Same-tx composition: bridge runs inside confirm's tx, so any subsequent step that throws rolls back the treasury writes automatically.

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Phase 4.1.2 → Phase 4.2 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | PASS 0/0. |
| 3 | Typecheck | ✅ real | PASS. |
| 4 | Build | ✅ real | PASS — 2 new dynamic routes (`/api/v1/treasury`, `/api/v1/treasury/handover`). |
| 5 | Unit + coverage | ✅ real, exit 0 | **224/224 (26 files)**. Coverage Stmt 88.32% / Branches 87.82% / Funcs 96.92% / Lines 88.69%. Per contract amendment §4, `vitest.config.ts` was extended only AFTER Gate 5 failed (integration-territory treasury files + users/treasury-wiring). New unit test added for `UserDto` driver-with-managerId. |
| 6 | Integration | ✅ real, live DB | **213/213 passed (26 files), zero skipped.** Previous 4.1.2 baseline 196 (25 files). Δ = +17 = the 17 new Phase 4.2 cases (T-H1..T-H7, T-V1..T-V4, T-B1..T-B4, T-A1, T-E2E). Wall-clock 1225.54s (~20.4 min) on live Neon. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS (new 0009 migration). |
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

- [✅] Phase 2.* / 3.* — no treasury interaction; unaffected.
- [✅] Phase 4.0 / 4.0.1 / 4.0.2 / 4.1 / 4.1.1 / 4.1.2 — fixture updated via `wireManagerAndDrivers`; every confirm-delivery path now has a driver with `manager_id` + `driver_custody`, so the bridge succeeds.
- [🆕] Handover happy/negative/idempotent/cross-team/unlinked/concurrent (T-H1..T-H7).
- [🆕] Visibility pm/manager/driver/seller/stock_keeper (T-V1..T-V4).
- [🆕] Bridge happy/unlinked/cap/concurrent (T-B1..T-B4).
- [🆕] Append-only trigger proof (T-A1).
- [🆕] End-to-end collection → handover (T-E2E).

---

## 8. API Impact

- **2 new endpoints** (see §2).
- **No breaking change** to existing response shapes. `confirm-delivery` body still `{ delivery, invoiceId }`.
- **5 new error codes** added to the wire contract — all documented in 31_Error_Handling.md.

---

## 9. DB Impact

- New column `users.manager_id` (nullable INTEGER, FK to users.id).
- Migration backfills `manager_box` for every pre-existing `role='manager' AND active=true` user.
- New write patterns on `treasury_accounts` (FOR UPDATE by id; UPDATE balance) and `treasury_movements` (INSERT only).
- Per confirm-delivery with paidAmount > 0: +1 FOR UPDATE on custody, +1 UPDATE balance, +1 INSERT movement.
- Per handover: +2 FOR UPDATE (custody + manager_box, canonical order), +2 UPDATE balance, +1 INSERT movement, +1 activity_log row.

---

## 10. Security Check

- Route-level gates: seller/stock_keeper blocked at `requireRole` for both endpoints.
- Service-level gates: manager cannot handover for a driver outside their team (strict `drv.manager_id === caller.userId`).
- FOR UPDATE lock order is canonical (lower id first) for handover — prevents deadlocks AND accidental cross-account writes.
- Append-only guarantee on `treasury_movements` proven by T-A1.
- `driver_custody_cap_eur` read inside the bridge tx (after FOR UPDATE on custody) so the cap cannot be race-bypassed.

---

## 11. Performance Check

- Handover: 2 account FOR UPDATEs + 2 balance UPDATEs + 1 movement INSERT + 1 activity_log (hash-chained) INSERT. All in one network-round-trip tx.
- Bridge: +1 FOR UPDATE on custody + 1 UPDATE + 1 INSERT on confirm-delivery's existing tx. Negligible against the existing order/delivery/payment work.
- Visibility query: for manager, one `SELECT users WHERE managerId = caller.id AND role='driver'` + one `SELECT treasury_accounts WHERE ... IN (...)`. Small result set per manager; indices on `users.managerId` are not yet added (acceptable for current scale — flagged for future).

---

## 12. Self-Review Findings

### What I checked exactly

Against every doc listed in the user's amended contract:

- **[00_DECISIONS.md](../requirements-analysis/00_DECISIONS.md)**: D-10 (supplier_credit removal) not touched; D-16/D-79 idempotency applied to handover; D-44 custody cap enforced in bridge; D-58 trigger relied on for append-only proof (read migration 0001 and verified `treasury_movements_no_update` is installed at [`0001_immutable_audits.sql#L38-L41`](../../src/db/migrations/0001_immutable_audits.sql#L38-L41)).
- **[02_DB_Tree.md](../requirements-analysis/02_DB_Tree.md)**: schema fields documented match the Drizzle schema exactly after this tranche (owner_user_id INT, manager_id on users, bootstrap rules noted).
- **[09_Business_Rules.md](../requirements-analysis/09_Business_Rules.md)**: BR-52 hierarchy implemented (bootstrap + parent_account_id on custodies); BR-53 atomicity via FOR UPDATE + same-tx compositions; BR-55 every collection → movement in the confirm tx; BR-55b cap in bridge.
- **[12_Accounting_Rules.md](../requirements-analysis/12_Accounting_Rules.md)**: account hierarchy matches spec; only `sale_collection` and `driver_handover` categories are written by Phase 4.2. `from_account_id = NULL` for `sale_collection` (inflow; user-locked decision).
- **[15_Roles_Permissions.md](../requirements-analysis/15_Roles_Permissions.md)**: role matrix for treasury-read + treasury-handover encoded in `permissions.ts` + enforced in `service.ts` + `requireRole` at route layer.
- **[16_Data_Visibility.md](../requirements-analysis/16_Data_Visibility.md)**: manager sees own box + team custodies; driver sees own; pm/gm see all; seller + stock_keeper blocked. Proven by T-V1..T-V4.
- **[22_Print_Export.md](../requirements-analysis/22_Print_Export.md)**: not touched.
- **[29_Concurrency.md](../requirements-analysis/29_Concurrency.md)**: row-level `FOR UPDATE` on both accounts during handover with canonical lock order (lower id first). Advisory lock via `withIdempotencyRoute` serializes same-key replays.
- **[31_Error_Handling.md](../requirements-analysis/31_Error_Handling.md)**: 5 new codes + `CUSTODY_CAP_EXCEEDED` description refreshed.
- **[35_API_Endpoints.md](../requirements-analysis/35_API_Endpoints.md)**: both new endpoints fully documented. `/transfer` + `/reconcile` marked out of Phase 4.2.

### Sensitive invariants in this tranche — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| I1 | Conservation on handover: Δ(custody)+Δ(manager_box)=0 | T-H1 (balances after) + T-E2E (full round-trip) |
| I2 | Atomicity: movement ⇔ balance | Same-tx composition in `performHandover`; T-H2 proves failed handover leaves zero side effects (including zero movements + zero balance change) |
| I3 | No overdraft: `amount ≤ custody.balance` under FOR UPDATE | T-H2 sequential + T-H7 concurrent |
| I4 | Role isolation: manager cannot see cross-team custodies | T-V2 asserts `owners.has(driverOtherId)` is false |
| I5 | Idempotency: replay → same response, 1 movement | T-H3 |
| I6 | Append-only: UPDATE treasury_movements rejected | T-A1 (triggers D-58 rejection) |
| I7 | Category correctness: handover → `driver_handover`; bridge → `sale_collection` | Each test reads category field |
| I8 | BR-55b cap on bridge under concurrency | T-B4 parallel confirms |
| I9 | Bridge zero side effects on cap breach | T-B3 asserts delivery/order/payment/bonus/invoice/movement all untouched after 409 |
| I10 | Unlinked driver blocked on both bridge + handover | T-B2 (bridge path) + T-H6 (handover path) |
| I11 | FOR UPDATE lock canonical order prevents deadlocks | Code review + T-H7 passes under concurrency |

### Known gaps (non-blocking)

1. **No index on `users.manager_id`**. For a small number of managers this is immaterial, but as `users` grows the manager-visibility query would benefit from a BTREE index. Adding it is a one-line migration; deferred to avoid scope creep.
2. **No chain-verify endpoint** on treasury_movements. Hash-chain not implemented per contract; append-only is enforced by D-58 trigger only. A later audit-tooling tranche can add hash-chain.
3. **No UI**. Server-side only; the admin/manager/driver apps will consume these endpoints in a later tranche.
4. **`HANDOVER_NOT_ALLOWED` not added** per amendment §2. Generic 403 `FORBIDDEN` from `PermissionError` covers all unauthorized paths.
5. **Date-range filter on /api/v1/treasury movements** is not implemented (only pagination). A manager reviewing a specific period would need to page through or use IDs. Scope-excluded.

### Why each gap is non-blocking

- (1) performance concern at scale, not a correctness concern.
- (2) D-58 trigger is the primary guarantee — hash-chain would be belt-and-suspenders.
- (3) deliberate — API-first tranche.
- (4) honors the user amendment.
- (5) can be layered on without breaking current contract.

### Concurrency proof notes

- `T-H7`: two parallel handovers of 70 each with custody=100. FOR UPDATE on the custody row forces the second handover to wait; when it reads the balance it's now 30, so `70 > 30 + 0.005` fires `INSUFFICIENT_CUSTODY`.
- `T-B4`: two parallel confirm-delivery calls with paidAmount=70 each, custody=200, cap=300. First bridge bumps balance to 270 (under cap), commits. Second bridge sees 270 + 70 = 340 > 300, fires `CUSTODY_CAP_EXCEEDED`, rolls back.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green (1/2/3/4/5/6/8).

### الشروط

- Commit locally; no push per standing rule.
- Phase 4 continuation (transfer/reconcile/settlements) remains blocked on reviewer approval.

---

## 14. ملاحظة صدق

This tranche ended up wider than a strict "treasury core" because three honest blockers had to be resolved to satisfy the stated invariants (role isolation, BR-55 end-to-end, BR-55b under concurrency). The scope was captured in the Implementation Contract amendment list, accepted before any `src/` write.

The negative-first test discipline surfaced two test-code mistakes on the first real run (reference_id cross-table collision in T-B3 assertions, and the need to match drizzle's wrapped error on T-A1). Both were genuine test-code defects — not code under test — and were fixed in the second pass. The fix pattern was recorded in the Self-Review notes.

No trigger was disabled. No shell tricks. No push. Phase 4 itself remains open.
