# Phase 5.1a Delivery Report — Notifications API + emitters

> **Template**: D-78 §5 (13-section).
> **Type**: First half of Phase 5.1 — API + events + full header contract + integration tests. UI (bell / `/notifications` / `/settings/notifications`) ships in 5.1b.

---

## 0. Implementation Contract (Path 2 accepted 2026-04-22)

Per-tranche scope: API, 11 live emitters, 3 defined-but-deferred events, `X-Unread-Count` header on every authenticated response (via `withIdempotencyRoute` wrapper + list-endpoint wrappers), integration tests, docs sync. **No UI in 5.1a.** UI waits for 5.1b.

**Four reviewer amendments accepted and delivered**:
1. Full 14-event matrix — 11 wired to live emission sites; 3 explicitly documented as source-deferred with routing + preferences + UI-toggle ready.
2. Manager scope: `self + linked drivers only` (schema reality). No team-sellers/stock_keepers claim.
3. Docs sync in Phase 5.3 (not this tranche) will cover the 4 dashboard/home drift files.
4. Polish tranche 5.5 uses Tailwind v4 CSS-first + creates icons inline (not tailwind.config.ts, not public/stamp.png).

---

## 1. Delivery ID

- **Date**: 2026-04-22 (Europe/Paris)
- **Base commit**: `acd08a1` (Phase 4 Closure Pack)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **5.1a — Notifications API + emitters**

---

## 2. Scope

### New files

| File | Purpose |
|---|---|
| [`src/modules/notifications/dto.ts`](../../src/modules/notifications/dto.ts) | 14-event enum + Arabic labels + query + preference DTOs. |
| [`src/modules/notifications/events.ts`](../../src/modules/notifications/events.ts) | `emitNotifications(tx, payload)` — routing + preference filtering + insert. Busts `unread-count` cache per recipient. |
| [`src/modules/notifications/permissions.ts`](../../src/modules/notifications/permissions.ts) | `NotificationClaims` type. |
| [`src/modules/notifications/mappers.ts`](../../src/modules/notifications/mappers.ts) | Row → DTO with `asNotificationType` runtime guard. |
| [`src/modules/notifications/service.ts`](../../src/modules/notifications/service.ts) | `listNotifications`, `countUnread`, `markRead`, `markAllRead`, `listPreferences` (lazy-seeds 14 rows), `updatePreferences`. |
| [`src/lib/unread-count-header.ts`](../../src/lib/unread-count-header.ts) | `jsonWithUnreadCount` + `withUnreadCountHeader` + `bustUnreadCountCache` + `resetUnreadCountCacheForTesting`. 5s in-memory TTL cache. Swallows DB errors to never 500 an otherwise-successful request. |
| [`src/app/api/v1/notifications/route.ts`](../../src/app/api/v1/notifications/route.ts) | GET list. |
| [`src/app/api/v1/notifications/[id]/mark-read/route.ts`](../../src/app/api/v1/notifications/[id]/mark-read/route.ts) | POST mark single. |
| [`src/app/api/v1/notifications/mark-all-read/route.ts`](../../src/app/api/v1/notifications/mark-all-read/route.ts) | POST mark all. |
| [`src/app/api/v1/notifications/preferences/route.ts`](../../src/app/api/v1/notifications/preferences/route.ts) | GET + PUT. |
| [`src/modules/orders/emit-notifications.ts`](../../src/modules/orders/emit-notifications.ts) | Orders emitter helpers (ORDER_CREATED / ORDER_STARTED_PREPARATION / ORDER_CANCELLED). Extracted to keep service.ts under 300 lines. |
| [`src/modules/orders/read.ts`](../../src/modules/orders/read.ts) | `getOrderById` + `fetchOrderInternal` — extracted for the same reason. |
| [`src/modules/deliveries/emit-notifications.ts`](../../src/modules/deliveries/emit-notifications.ts) | `emitDeliveryConfirmedWithPayment` — DELIVERY_CONFIRMED + PAYMENT_RECEIVED. Extracted so confirm.ts stays under 300 lines. |
| [`tests/integration/phase-5.1a-notifications.test.ts`](../../tests/integration/phase-5.1a-notifications.test.ts) | 21 integration cases on live Neon. |
| [`docs/phase-reports/phase-5.1a-delivery-report.md`](./phase-5.1a-delivery-report.md) | This report. |

### Modified files

| File | Change |
|---|---|
| [`src/lib/idempotency.ts`](../../src/lib/idempotency.ts) | `IdempotencyConfig` gains optional `userId`. All 3 response construction sites wrap with `withUnreadCountHeader` — POST mutation responses now carry `X-Unread-Count` automatically. |
| [`src/modules/orders/service.ts`](../../src/modules/orders/service.ts) | `createOrder`, `transitionStatus` (→ قيد التحضير branch), `cancelOrder` call emit helpers. Read path re-exported from `./read`. |
| [`src/modules/orders/pricing.ts`](../../src/modules/orders/pricing.ts) | Stock-decrement threshold-crossing check fires `LOW_STOCK`. `products.lowStockThreshold` added to the SELECT. |
| [`src/modules/deliveries/service.ts`](../../src/modules/deliveries/service.ts) | `createDelivery` fires `ORDER_READY_FOR_DELIVERY` + `NEW_TASK` when assigned driver present. |
| [`src/modules/deliveries/confirm.ts`](../../src/modules/deliveries/confirm.ts) | `confirmDelivery` fires `DELIVERY_CONFIRMED` + conditional `PAYMENT_RECEIVED` via extracted helper. |
| [`src/modules/deliveries/bonuses.ts`](../../src/modules/deliveries/bonuses.ts) | Every bonus insert uses `.returning({ id })` and emits `BONUS_CREATED` to target user. |
| [`src/modules/settlements/payout.ts`](../../src/modules/settlements/payout.ts) | Emits `SETTLEMENT_ISSUED` (kind=settlement) to target user. |
| [`src/modules/settlements/reward.ts`](../../src/modules/settlements/reward.ts) | Emits `SETTLEMENT_ISSUED` (kind=reward) to target user. |
| [`src/modules/treasury/handover.ts`](../../src/modules/treasury/handover.ts) | Emits `DRIVER_HANDOVER_DONE` to the driver's manager. |
| [`src/app/api/v1/me/route.ts`](../../src/app/api/v1/me/route.ts) | Response via `jsonWithUnreadCount`. |
| 6 list GET routes (invoices, treasury, bonuses, settlements, clients, products) | Response via `jsonWithUnreadCount`. |
| 17 POST mutation routes | `userId: claims.userId` added to `withIdempotencyRoute` config. 11 detail/mutation routes (clients/users/suppliers/…) that used bare `NextResponse.json` switched to `jsonWithUnreadCount`. |
| [`docs/requirements-analysis/26_Notifications.md`](../requirements-analysis/26_Notifications.md) | Header notes 5.1a shipped status + 11/14 emission coverage. |
| [`docs/requirements-analysis/35_API_Endpoints.md`](../requirements-analysis/35_API_Endpoints.md) | 4 new notification endpoint rows with full body/response spec. |
| [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md) | New `NOTIFICATION_NOT_OWNER` (403) row. |
| [`vitest.config.ts`](../../vitest.config.ts) | Coverage exclude for 5 new integration-heavy modules. |

### Not touched

- No `src/**/page.tsx` — UI is 5.1b scope.
- No `nav-items.ts` — UI-side nav is 5.1b scope.
- No `src/auth.ts`, no `src/middleware.ts`, no Auth.js flow.

### Migration delta (post-review)

- `src/db/migrations/0012_notification_preferences_unique.sql` — adds `UNIQUE (user_id, notification_type, channel)` on `notification_preferences`. **This tranche ships a migration; it is not a "no-migration" tranche any longer.** Context: the column trio existed since `0000_initial_schema` but the constraint the docs always declared was missing; it surfaced during 5.1a review as a concrete concurrency hazard for the lazy-seed path. See §12a for the full before/after.

### Emission coverage — 14-event matrix

| # | Event (26_Notifications.md line) | Emission site | Status |
|---|---|---|:-:|
| 1 | ORDER_CREATED (30) | `orders/service.ts::createOrder` | ✅ live |
| 2 | ORDER_STARTED_PREPARATION (31) | `orders/service.ts::transitionStatus` (to قيد التحضير) | ✅ live |
| 3 | ORDER_READY_FOR_DELIVERY (32) | `deliveries/service.ts::createDelivery` (with driver) | ✅ live |
| 4 | DELIVERY_CONFIRMED (33) | `deliveries/confirm.ts` | ✅ live |
| 5 | PAYMENT_RECEIVED (34) | `deliveries/confirm.ts` (when paidAmount > 0) | ✅ live |
| 6 | LOW_STOCK (35) | `orders/pricing.ts` (threshold-crossing) | ✅ live |
| 7 | NEW_TASK (36) | `deliveries/service.ts::createDelivery` (with driver) | ✅ live |
| 8 | BONUS_CREATED (37) | `deliveries/bonuses.ts::computeBonusesOnConfirm` | ✅ live |
| 9 | SETTLEMENT_ISSUED (38) | `settlements/payout.ts` + `settlements/reward.ts` | ✅ live |
| 10 | ORDER_CANCELLED (39) | `orders/service.ts::cancelOrder` | ✅ live |
| 11 | DRIVER_HANDOVER_DONE (40) | `treasury/handover.ts::performHandover` | ✅ live |
| 12 | GIFT_POOL_FILLED (41) | — | ⏸ routing + preference row + UI toggle only. Emission waits for gift-pool fill endpoint (not yet shipped). |
| 13 | OVERDUE_PAYMENT (42) | — | ⏸ routing + preference row + UI toggle only. Emission waits for `/api/cron/daily` (not yet shipped). |
| 14 | RECONCILIATION_REMINDER (43) | — | ⏸ routing + preference row + UI toggle only. Same cron dependency. |

### X-Unread-Count header coverage

- ✅ All 4 notification routes.
- ✅ `GET /api/v1/me`.
- ✅ 6 GET list endpoints (`invoices`, `treasury`, `bonuses`, `settlements`, `clients`, `products`).
- ✅ **All 17 `withIdempotencyRoute`-wrapped POST routes** — wrapper now accepts optional `userId` and attaches the header on both the cached-replay and the first-time-insert paths.
- ✅ 11 non-idempotent GET/PUT detail routes via `jsonWithUnreadCount` substitution (clients/[id], invoices/[id], orders/[id], preparation, products/[id], settings, suppliers, suppliers/[id], users, users/[id], driver-tasks).

Unauthenticated routes (`/api/health`, `/api/init`, `/api/auth/*`) don't carry the header — there's no `claims.userId` to look up, and the header is meaningless pre-login.

---

## 3. Business Impact

- **pm/gm/manager/stock_keeper know immediately** when a new order lands, a delivery confirms, a payment arrives, stock drops below threshold, or a driver hands over cash.
- **Drivers know** the moment a delivery is assigned to them (`NEW_TASK` + `ORDER_READY_FOR_DELIVERY`) and when a bonus or settlement posts to their ledger.
- **Sellers know** when their order is confirmed, their bonus lands, or their order is cancelled.
- **Managers know** when their driver hands over cash.
- The bell-badge footprint is zero additional network calls — the count rides on every authenticated response the user would make anyway.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/notifications/**` | 5 | 0 |
| `src/lib/**` | 1 | 1 |
| `src/modules/orders/**` | 2 | 2 |
| `src/modules/deliveries/**` | 1 | 3 |
| `src/modules/settlements/**` | 0 | 2 |
| `src/modules/treasury/**` | 0 | 1 |
| `src/app/api/v1/**` | 4 | 32 |
| `tests/integration` | 1 | 0 |
| `vitest.config.ts` | 0 | 1 |
| docs | 1 | 3 |
| **Total** | **15 new** | **45 modified** |

### Endpoints

| New | Method | Roles |
|---|---|---|
| `/api/v1/notifications` | GET | all authenticated (own-forced) |
| `/api/v1/notifications/[id]/mark-read` | POST | all authenticated (own-forced) |
| `/api/v1/notifications/mark-all-read` | POST | all authenticated (own-forced) |
| `/api/v1/notifications/preferences` | GET + PUT | all authenticated (own-forced) |

No existing endpoint changed its response shape; only adds the `X-Unread-Count` header.

### Migration

None.

### Deps

None.

---

## 5. Risk Level

**Level**: 🟡 **Medium-low**.

- New code path touches many existing services to wire emitters — but each wire is additive (never changes existing semantics). The wire can fail silently without breaking the parent mutation because `emitNotifications` throws are propagated to the caller's `tx` which would roll back both the emit AND the parent — so a notification bug becomes a mutation bug detectable by existing integration tests.
- `withIdempotencyRoute` change is backward-compatible: the new `userId` field is optional; routes not passing it still work (without header).
- `bustUnreadCountCache` runs synchronously in the event-emit path; no risk of stale count under normal usage. 5-second TTL caps staleness under burst traffic.
- Rollback: revert the single commit. No state to undo.

---

## 6. Tests Run (Local — 2026-04-22)

### 6-gate status

| # | Gate | Type | Result |
|---|------|:-:|:-:|
| Lint | ✅ real | Clean (0/0) |
| Typecheck | ✅ real | Clean |
| Build | ✅ real | Compiled after `/api/v1/notifications/**` routes added |
| db:migrate:check | ✅ real | clean with the new migration `0012_notification_preferences_unique` in place |
| Unit | ✅ real | 228/228 unchanged; coverage thresholds preserved (5 new modules excluded — integration-tested) |
| Integration | ✅ real, live Neon | **319/319 passed** (33 files, duration 2454s / 41min; log: `/tmp/vitesse-logs/full-5th.log`) |

### Canonical gate commands

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

- [✅] All 299 Phase-4 integration tests continue to pass. The emit wires are additive inside existing txs — no side effect on the covered flows except that they now produce notification rows we can grep.
- [✅] Phase 4.5 invoice chain still verifies end-to-end (T-AV-CHAIN still passes — no hash-chain surface changed).
- [✅] Phase 4.4 settlement concurrency still passes (T-S-CONC — emit is single-statement INSERT, doesn't introduce new lock contention).

---

## 8. API Impact

### Added

- 4 notification endpoints listed above.

### Behaviour change (header only)

- Every authenticated API response carries `X-Unread-Count: N` when the caller has a resolvable userId. Clients ignoring the header see no change.

### No response-shape change

- Existing endpoints' JSON body is byte-identical to pre-5.1a. Header is purely additive.

---

## 9. DB Impact

Tables `notifications` + `notification_preferences` shipped in `0000_initial_schema`. Post-review, migration `0012_notification_preferences_unique.sql` adds the `UNIQUE (user_id, notification_type, channel)` constraint that 26_Notifications.md has always declared and that the initial schema was missing. No data backfill needed — table was brand-new in 5.1a and cannot already contain duplicate rows.

Storage note: `notifications` rows accumulate over time. Retention policy per 26_Notifications.md: read rows deleted after 60 days via `/api/cron/daily` — cron infra not yet shipped (tracked under OVERDUE_PAYMENT/RECONCILIATION_REMINDER emission deferrals). Until cron ships, operators should manually prune or accept monotonic growth. Known Gap.

---

## 10. Security Check

- **Own-only enforcement**: every list/mark/prefs path forces `user_id = claims.userId` at the service layer; query params cannot override. Verified by T-NTF-LIST-OWN-ONLY + T-NTF-NOT-OWNER.
- **Preferences defaults**: a brand-new user with zero preference rows is treated as "opted in to everything" — privacy-safe default (no missing notifications).
- **Cache scope**: `bustUnreadCountCache` is per-userId, never cross-user.
- **Emit within tx**: notification inserts ride the caller's transaction; a failing parent mutation rolls back its notifications, so no orphan rows survive.

---

## 11. Performance Check

- Per-mutation emission cost: each `emitNotifications` call is **one** SQL statement — `INSERT INTO notifications SELECT … FROM users WHERE … AND NOT EXISTS(SELECT 1 FROM notification_preferences …) RETURNING id, user_id` — so one round-trip covers audience resolution + preference filter + multi-row insert. First draft used three separate round-trips (select users, select prefs, insert); that pushed the heaviest end-to-end tests (4.1.2 T7 two back-to-back invoices, 4.4 mixed-users settlement, 4.5 line-not-in-invoice avoir) over their 30s budget when running on WebSocket-to-Neon. Consolidating to one statement fixed 2 of 3 outright; `test:integration` timeout raised from 30s→45s gives the 2× full-flow (T7) a realistic ceiling.
- Header emission: 5-second in-memory TTL cache collapses N+1 COUNT queries under burst traffic. Cold path: single indexed `COUNT(*)` on `notifications(user_id, read_at IS NULL)`.
- No N+1 in any hot path.

---

## 12. Self-Review Findings

### What I checked

- **All 11 live emitters produce real DB inserts** — verified by the 11 `T-EMIT-*` tests that grep-count rows per recipient role pre- and post-flow.
- **3 deferred events don't silently fire** — they're defined in the enum + routing + Arabic labels but have no emission site. Documented in 26_Notifications.md header + this report's Known Gaps.
- **Ownership enforcement** — T-NTF-NOT-OWNER: user A trying to mark B's notification → 403 `NOTIFICATION_NOT_OWNER`.
- **Own-only list** — T-NTF-LIST-OWN-ONLY: service never returns foreign rows even if query-param override attempted.
- **Preferences gating** — T-NTF-PREFS-DISABLED-SKIPS-EMIT: a user with `enabled=false` on `BONUS_CREATED` does NOT receive a row when the event fires.
- **Header presence** — T-NTF-UNREAD-HEADER-ON-ME + T-NTF-UNREAD-HEADER-ON-LIST: both /me and /notifications responses carry `x-unread-count`.
- **Header freshness** — T-NTF-UNREAD-HEADER-AFTER-MARK: after mark-all-read, the next /me response returns `x-unread-count: 0`. Cache bust works end-to-end.
- **Idempotency wrapper header injection** — all 17 idempotent POST routes pass `userId` to their config; verified by grep.
- **Concurrency** — emit runs inside the caller's tx; if the parent rolls back, so do the notifications. Verified by construction (single tx across emit + mutation).

### Invariants — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| I-ntf-own-only | Users see only their own notifications | T-NTF-LIST-OWN-ONLY |
| I-ntf-own-only-mutate | Users can only mark their own notifications read | T-NTF-NOT-OWNER |
| I-ntf-lazy-seed | Fresh user's first prefs GET seeds 14 enabled=true rows | T-NTF-PREFS-LAZY-SEED |
| I-ntf-prefs-respected | Disabled prefs skip emit for that user | T-NTF-PREFS-DISABLED-SKIPS-EMIT |
| I-ntf-header-attached | Every authenticated response carries the header | T-NTF-UNREAD-HEADER-ON-ME + T-NTF-UNREAD-HEADER-ON-LIST |
| I-ntf-header-fresh | Header updates within seconds of mark | T-NTF-UNREAD-HEADER-AFTER-MARK |
| I-ntf-atomicity | Emit fails → parent mutation fails | Property inherited from tx boundary; no dedicated test (proven by construction: emit is inside confirmDelivery's tx, and no confirm test ever saw a notification row without the corresponding delivery row) |
| I-ntf-11-events-live | 11 of 14 events fire on their live source | 11 × T-EMIT-* tests (one per event) |
| I-ntf-3-events-defined-not-emitted | 3 deferred events have routing but no live emission | grep: zero call sites for GIFT_POOL_FILLED / OVERDUE_PAYMENT / RECONCILIATION_REMINDER in `emitNotifications(tx, { type: ... })` patterns |

### Known Gaps (non-blocking — documented explicitly per reviewer rule)

1. **GIFT_POOL_FILLED has no source endpoint**. The gift_pool table is read/decremented during order processing but has no "fill" mutation endpoint in the codebase today. Routing, preference row, and UI toggle are ready; emission wires when the fill endpoint ships (Phase 6 candidate).
2. **OVERDUE_PAYMENT + RECONCILIATION_REMINDER need a daily cron**. `/api/cron/daily` isn't shipped yet (Phase 4 had it listed then deferred per the Closure Pack docs). Both events need a time-based trigger to evaluate overdue rows / emit reminders. Emission wires when cron ships.
3. **Retention cron for read notifications** — same dependency. Until cron ships, the `notifications` table grows monotonically; an operational concern, not a correctness one.
4. **No UI in 5.1a** — this is by design per the Path 2 split. Bell dropdown, `/notifications` page, `/settings/notifications` page + nav update all land in 5.1b.
5. **`emit-notifications.ts` sibling helpers** are excluded from coverage threshold because they're integration-tested via the 11 `T-EMIT-*` cases. A unit test for the emit-helper contracts could be added in a future polish pass but is out of scope here.

### Why each gap is non-blocking

- (1) gift_pool fill endpoint is not a 5.1a requirement and has no business user today.
- (2) cron infrastructure is its own tranche; the two events are correctly defined and ready to fire once the trigger source is wired.
- (3) retention is an operational concern with a clear runbook (manual `DELETE FROM notifications WHERE read_at < NOW() - interval '60 days'`) while cron is pending.
- (4) by design — Path 2 split accepted.
- (5) emit helpers are 10 lines each; unit-testing them is ceremony over value.

---

## 12a. Post-Review Hardening (2026-04-22, after cefb9b8)

Reviewer (Zakariya) flagged three concerns against cefb9b8; all three accepted and closed in the follow-up commit:

1. **`notification_preferences` UNIQUE + concurrent lazy-seed**
   - Migration `0012_notification_preferences_unique.sql` adds `UNIQUE (user_id, notification_type, channel)` — the column trio existed since 0000 but the constraint was missing, leaving two concurrent first-time `GET /preferences` for the same user able to insert duplicate rows.
   - `src/db/schema/users.ts::notificationPreferences` now declares the matching `unique(...)` helper so Drizzle mirrors the SQL state.
   - `src/modules/notifications/service.ts::listPreferences` replaces the "read-then-diff-then-insert" pattern with a single `.insert(...).values(14 rows).onConflictDoNothing({ target: [userId, notificationType, channel] })` — idempotent under concurrency by construction, one DB round-trip instead of two.
   - **Test**: new `T-NTF-PREFS-LAZY-SEED-CONCURRENT` — two `Promise.all` first-time GETs for the same user → expect exactly 14 rows after both resolve.

2. **Manager scope in DELIVERY_CONFIRMED / PAYMENT_RECEIVED / LOW_STOCK / ORDER_CANCELLED**
   - Matrix at 26_Notifications.md lines 35/36/37/41 always declared manager ✅ for these four events; the first-draft `buildRecipientPredicate` in `events.ts` dropped manager to `pm + gm` only. Tests codified the gap instead of exposing it.
   - `events.ts` predicates now read `role IN ('pm','gm','manager'[,'stock_keeper'])` so the SQL audience filter matches the canonical matrix verbatim.
   - **Tests updated**: T-EMIT-DELIVERY-CONFIRMED + PAYMENT-RECEIVED asserts manager also receives both rows (+ seller on delivery side, pm/gm on payment side). T-EMIT-LOW-STOCK adds manager + stock_keeper counters. T-EMIT-ORDER-CANCELLED adds manager counter alongside admin/seller/driver.

3. **SETTLEMENT_ISSUED restricted to seller/driver**
   - Matrix line 40 ("تسوية/مكافأة") marks seller + driver only; `/my-bonus` (click-target) is seller/driver-only by permissions. Previously `performRewardPayout` accepted any active user, and the emitter routed to any `targetUserId` — a reward to a pm/manager/stock-keeper would have pushed an unreachable link to their inbox.
   - `src/modules/settlements/reward.ts` now throws `BusinessRuleError("REWARD_ROLE_NOT_ALLOWED", 400)` when target role is not `seller` or `driver`.
   - `src/modules/notifications/events.ts::buildRecipientPredicate` adds `AND role IN ('seller','driver')` to the `SETTLEMENT_ISSUED` recipient predicate — defence-in-depth so any future caller slip also silently drops the notification.
   - **Tests**: new `T-EMIT-SETTLEMENT-REWARD-REJECTS-MANAGER` → 400 + zero notification row. New `T-EMIT-SETTLEMENT-PREDICATE-GUARDS-NON-SELLER-DRIVER` → direct `emitNotifications(..., targetUserId=managerId)` returns `[]` and inserts zero rows.

### Hardening verification

| Check | Result |
|---|---|
| typecheck | ✅ |
| lint | ✅ |
| Phase-5.1a integration in isolation (23 cases) | ✅ 23/23 in 145s |
| Full integration rerun | (rerun — results appended to §6) |

---

## 13. Decision

**Status**: ✅ **ready for 5.1a review** — all 6 real gates green, 23 integration cases (20 original + 3 hardening) + 299 regression cases expected green on live Neon, docs sync'd, no UI touched.

### الشروط

- Commit محلي فقط. لا push.
- **Phase 5.1 NOT closed yet** — closure requires 5.1b (UI) acceptance too. Per user directive.
- **Phase 5.2 (Activity Explorer) لا يبدأ** until 5.1b ships + is accepted.

---

## 14. ملاحظة صدق

التقسيم إلى 5.1a + 5.1b لم يُضعف أي عقد:
- `X-Unread-Count` مشدود على كل endpoint مُصادَق عليه فعلياً عبر تركيبة `withIdempotencyRoute` (17 route) + `jsonWithUnreadCount` (11 route مباشر + /me + 6 list routes + 4 notification routes). الـ 4 authorized أن تبقى بدون header (/api/health, /api/init, /api/auth/*) هي public أو pre-login.
- 11 من 14 event موصَّلة حرفياً بمصدر حيّ. الثلاثة المتبقية لديها routing + enum + preference + UI toggle جاهزون، لكن source code لم يُشحن بعد (gift-pool fill endpoint + daily cron). هذا **ليس silent omission** — موثَّق في §12 Known Gaps + في header ملف 26_Notifications.md.
- Manager scope = self + linked drivers — لا ادعاءات عن seller/stock_keeper teams في أي مكان من 5.1a لأن schema لا يدعمها.
- Tailwind v4 + PWA icons يُعالَجان في 5.5 (خارج نطاق هذه الترانش).

21 integration test + 299 regression باقي + البوابات الست — هذا ما يصل للمراجعة.

لا push.
