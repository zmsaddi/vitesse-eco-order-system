# Phase 4.4.1 Delivery Report — UI completion + canonical API + nav sync

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: Corrective UI tranche on top of Phase 4.4. Narrow scope — three points, three touches. No backend logic changes, no API contract changes, no schema changes.

---

## 0. Implementation Contract (accepted 2026-04-21 with 2 mandatory amendments)

**Defects verified with file+line** (from user review of Phase 4.4):
1. [`src/app/(app)/settlements/page.tsx:5-33`](../../src/app/(app)/settlements/page.tsx#L5-L33) (pre-4.4.1 state) — documentation shell only; no list table, no settlement form, no reward form. Violated the explicit Phase 4.4 contract requirement.
2. [`src/app/(app)/my-bonus/page.tsx:3,19`](../../src/app/(app)/my-bonus/page.tsx#L3) (pre-4.4.1) — imported `listBonuses` from `@/modules/settlements/service` and called it via `withRead(...)` inside the server component. Violated the canonical-API-usage rule and opened a drift risk if the route later grew middleware, rate-limits, or observability.
3. [`src/components/layout/nav-items.ts:45`](../../src/components/layout/nav-items.ts#L45) (pre-4.4.1) — manager still had `/settlements` even though the API gate was tightened to pm/gm only in Phase 4.4. [`nav-items.ts:47-55`](../../src/components/layout/nav-items.ts#L47-L55) — seller and driver had no `/my-bonus` link.

**Two amendments locked**:
1. **Idempotency-Key generated inside submit handler on every attempt** — not at mount, not in stable `useState`. If the user fixes a validation error and resubmits, a fresh key avoids an unintended cached-response replay.
2. **Smoke evidence required in the report** since no new automated tests — specifically covering pm/gm page access, manager nav+page absence, seller/driver nav visibility + page access, and `/my-bonus` canonical API usage.

**Out of scope**: backend logic, API contracts, schema, new error codes, docs beyond this report + §0 errata on 4.4, and Phase 4.5.

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `e86d265` (Phase 4.4)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.4.1 — UI completion + canonical API + nav sync**

---

## 2. Scope

### New files (3)

| File | Purpose |
|---|---|
| [`src/app/(app)/settlements/_components/new-settlement-form.tsx`](../../src/app/(app)/settlements/_components/new-settlement-form.tsx) | Client component `<NewSettlementForm>` — pm/gm form for `POST /api/v1/settlements` with `kind:"settlement"`. Fields: `userId`, `bonusIds` (CSV → `number[]`), `fromAccountId`, `paymentMethod` (dropdown كاش/بنك), `notes`. Generates `Idempotency-Key` via `crypto.randomUUID()` **inside** `async function handleSubmit` so corrected resubmits carry a fresh key. Calls `router.refresh()` on success. No form libraries, no toasts. |
| [`src/app/(app)/settlements/_components/new-reward-form.tsx`](../../src/app/(app)/settlements/_components/new-reward-form.tsx) | Client component `<NewRewardForm>` — pm/gm form for `kind:"reward"`. Same amendment: submit-time `crypto.randomUUID()`. Fields: `userId`, `amount`, `fromAccountId`, `paymentMethod`, `notes`. |
| [`docs/phase-reports/phase-4.4.1-delivery-report.md`](./phase-4.4.1-delivery-report.md) | This report. |

### Modified files (4)

| File | Change |
|---|---|
| [`src/app/(app)/settlements/page.tsx`](../../src/app/(app)/settlements/page.tsx) | Full rewrite: server component calls `fetch(...${host}/api/v1/settlements?limit=50)` with cookie forwarding (canonical pattern from [`(app)/layout.tsx`](../../src/app/(app)/layout.tsx)); renders a real table (id / date / username / role / type / amount / paymentMethod / applied state for debts); composes `<NewSettlementForm />` + `<NewRewardForm />`. `enforcePageRole(["pm","gm"])` at the top, redirect for other roles. |
| [`src/app/(app)/my-bonus/page.tsx`](../../src/app/(app)/my-bonus/page.tsx) | Removed `import { listBonuses } from "@/modules/settlements/service"` and the `withRead(...)` call. Replaced with a `fetchBonusesCanonically()` helper that does `fetch(...${host}/api/v1/bonuses)` with forwarded cookies. UI unchanged (summary cards + bonuses table). |
| [`src/components/layout/nav-items.ts`](../../src/components/layout/nav-items.ts) | (a) Removed `/settlements` from manager array + inline comment pointing at the Phase 4.4 decision. (b) Added `{ href:"/my-bonus", labelAr:"عمولتي" }` to seller array. (c) Added same entry to driver array. |
| [`docs/phase-reports/phase-4.4-delivery-report.md`](./phase-4.4-delivery-report.md) | §0 Errata at top pointing to this report. |

### What did NOT change

- No backend module touched. No API handler touched. No Zod DTO touched.
- No schema, no migration.
- No error codes, no `31_Error_Handling.md` edits.
- No permission contract changes in `15_Roles_Permissions.md` / `16_Data_Visibility.md` (they were already correct after Phase 4.4 — only nav was out of sync).
- No push.

---

## 3. Business Impact

- **pm/gm can now actually pay bonuses and grant rewards from the UI**. Previously the `/settlements` page only documented that they could do it via curl. Now they have a minimal but functional two-form interface over the same `POST /api/v1/settlements` endpoint that was already shipped and tested in Phase 4.4.
- **seller/driver can now find `/my-bonus`** from the sidebar. Previously it was a deep-link-only route, functionally invisible.
- **manager no longer sees a `/settlements` link** that the API would 403 on. UI matches backend gate exactly.
- **`/my-bonus` data source is canonical**. Any future change to `/api/v1/bonuses` (new filter, added summary field, middleware) flows to the page for free — no drift surface left.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| Client components (`_components/*.tsx`) | 2 | 0 |
| Server pages | 0 | 2 |
| Nav config | 0 | 1 |
| Docs | 1 | 1 |
| **Total** | **3 new** | **4 modified** |

All new files well under the 300-line cap.

### Endpoints

Zero changes. Same Phase 4.4 endpoints; the UI now drives them.

### Migration

None.

### Deps

None.

---

## 5. Risk Level

**Level**: 🟢 **Low**.

- UI-only tranche. The forms are thin wrappers over already-tested POST endpoints.
- `/my-bonus` data-source switch is an HTTP indirection — the API and its role-gates were already exercised by 3 Phase 4.4 integration tests (T-P-GET-BONUSES-MAT, seller own-forced, driver own-forced).
- Rollback: revert the commit. No state to undo.

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Result |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | **PASS 0/0**. |
| 3 | Typecheck | ✅ real | **PASS**. |
| 4 | Build | ✅ real | **PASS** — both pages + both client components compile. |
| 5 | Unit + coverage | ✅ real | **224/224** unchanged, coverage 84.75%. |
| 6 | Integration | ✅ real, live Neon | **276/276 passed (31 files), zero skipped.** Wall-clock 1927s (~32 min). Zero regression vs. Phase 4.4 baseline. |
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

All from vanilla npm scripts.

---

## 7. Smoke evidence (required by amendment 2)

Ran against a fresh Neon schema seeded with 5 known-password users (smoke-pm, smoke-gm, smoke-manager, smoke-seller, smoke-driver — password `smoke441pass!`). `npm run dev --port 3001` in production-like mode; Auth.js credentials login per role; `curl -L` to follow middleware + `enforcePageRole` redirects.

**Nav visibility** (grep `href="/settlements"` + `href="/my-bonus"` in the `/action-hub` HTML for each role):

| Role | `/settlements` in nav | `/my-bonus` in nav | Contract |
|---|:-:|:-:|---|
| smoke-pm | **1** | 0 | pm/gm only for settlements; pm/gm don't see /my-bonus (not their scope) ✅ |
| smoke-gm | **1** | 0 | same ✅ |
| smoke-manager | **0** | 0 | manager out-of-scope for BOTH settlements (4.4 contract) and /my-bonus ✅ |
| smoke-seller | 0 | **1** | seller sees /my-bonus ✅ |
| smoke-driver | 0 | **1** | driver sees /my-bonus ✅ |

**Page access** (curl -L, observe final URL after redirects):

| Role | GET /settlements → | GET /my-bonus → |
|---|---|---|
| smoke-pm | **200 @ /settlements** ✅ | 200 @ /action-hub (redirected — not their page) ✅ |
| smoke-gm | **200 @ /settlements** ✅ | 200 @ /action-hub (redirected) ✅ |
| smoke-manager | 200 @ /action-hub (redirected — page blocked by enforcePageRole) ✅ | 200 @ /action-hub (redirected) ✅ |
| smoke-seller | 200 @ /orders (redirected — page blocked) ✅ | **200 @ /my-bonus** ✅ |
| smoke-driver | 200 @ /driver-tasks (redirected — page blocked) ✅ | **200 @ /my-bonus** ✅ |

`enforcePageRole` performs an internal server-side redirect to the role's home (D-72 `ROLE_HOMES`), observable here as the `FINAL=...` differing from the requested path.

**Canonical API usage** — static evidence from the shipped files:

```
src/app/(app)/my-bonus/page.tsx:8:  // (/api/v1/bonuses) rather than importing `listBonuses` directly.
src/app/(app)/my-bonus/page.tsx:35:   const res = await fetch(`${protocol}://${host}/api/v1/bonuses`, {
```

Grep of `listBonuses` across `src/app/**`:
```
$ grep -rn "listBonuses" src/app
(no results)
```

The page goes through the HTTP route layer; the service function is never imported by any page.

**Idempotency-Key is generated inside submit handlers** — grep on both form components:

```
src/app/(app)/settlements/_components/new-settlement-form.tsx:25:  async function handleSubmit(e: React.FormEvent) {
src/app/(app)/settlements/_components/new-settlement-form.tsx:39:    const idempotencyKey = crypto.randomUUID();
src/app/(app)/settlements/_components/new-reward-form.tsx:23:  async function handleSubmit(e: React.FormEvent) {
src/app/(app)/settlements/_components/new-reward-form.tsx:28:    const idempotencyKey = crypto.randomUUID();
```

`crypto.randomUUID()` is called at **line 39/28 — inside** the `handleSubmit` body that begins at line 25/23. NOT at module top level, NOT in a `useState` initialiser. A corrected resubmit calls `handleSubmit` again, which re-hits line 39/28 and generates a fresh key.

Smoke-runner scripts (`/.smoke-seed-441.mjs` + `/.smoke-run-441.sh`) were temp files deleted after this transcript; they are NOT committed. The DB schema was reset + re-seeded for the smoke, then left as-is (next integration test run will reset it again).

---

## 8. API Impact

Zero changes.

---

## 9. DB Impact

Zero changes. (Smoke seed + subsequent test runs operate on the same Neon project; the migration set is unchanged.)

---

## 10. Security Check

- `enforcePageRole` is the first statement in both pages — runs before any data fetch, redirects before any leakage possible.
- `/my-bonus` passes NO query params to `/api/v1/bonuses`; the route handler forces `userId=claims.userId` for seller/driver regardless. Double-locked.
- Forms POST the same canonical `/api/v1/settlements` endpoint with the same Idempotency-Key contract an external client would use — role gates, invariants, and idempotency are all enforced server-side, not UI-side.
- Cookie forwarding in the canonical fetch uses the incoming request's own cookies; no privileged elevation path.

---

## 11. Performance Check

- Added one extra internal HTTP round-trip per page render (Next server → its own route handler). Negligible at localhost and typical Vercel cold-path costs. In production this is the same trip a client browser would make, so caching + memoization behave identically.
- Client forms: no polling, no auto-save. Submit on click only.

---

## 12. Self-Review Findings

### What I checked exactly

- **nav-items.ts diff** — grep `"/settlements"` in `src/components/layout/nav-items.ts`: appears 2 times (pm + gm). Appears 0 times in manager array. grep `"/my-bonus"`: appears 2 times (seller + driver). Matches the Phase 4.4 permission contract exactly.
- **/my-bonus imports** — `grep -n "listBonuses\|withRead\|@/modules/settlements/service" src/app/\(app\)/my-bonus/page.tsx`: zero hits. Only `cookies`, `headers` from `next/headers`, `enforcePageRole`, and DTO types from `@/modules/settlements/dto`. No service-level function is invoked from the page.
- **/settlements composition** — page.tsx imports both `NewSettlementForm` + `NewRewardForm` (lines 4-5), renders them (lines 51-52), has a real `<table>` with 8 columns (line 56+), and fetches via `/api/v1/settlements?limit=50` with cookie forwarding (line 24).
- **Submit-time idempotency** — confirmed both `new-settlement-form.tsx:39` and `new-reward-form.tsx:28` place `crypto.randomUUID()` as the first statement after `setMsg(null)` inside `handleSubmit`. No mount-time or `useState((init))` key stored anywhere.
- **Runtime smoke** — see §7. pm/gm reach `/settlements` HTTP 200 at the intended URL; manager/seller/driver get redirected by `enforcePageRole`. seller/driver reach `/my-bonus` HTTP 200; pm/gm/manager get redirected. Nav HTML grep matches expected visibility for all 5 roles.
- **No regression** — full 276/276 integration passes. No existing test needed modification.

### Invariants — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| I-ui-settlements-complete | `/settlements` page has list table + settlement form + reward form | File grep: `<NewSettlementForm />`, `<NewRewardForm />`, `<table>` all present. Smoke: pm/gm GET /settlements → 200. |
| I-my-bonus-canonical | `/my-bonus` uses route handler, not direct service import | File grep: zero `listBonuses` or `withRead` references; `fetch(/api/v1/bonuses)` present at line 35. |
| I-nav-manager-no-settlements | Manager does not see /settlements in nav | Smoke grep-count = 0 for manager. File: no `/settlements` entry in the manager array. |
| I-nav-seller-driver-my-bonus | Seller + driver see /my-bonus in nav | Smoke grep-count = 1 for each. File: explicit entries. |
| I-page-role-gate | Each page redirects unauthorized roles before any fetch | `enforcePageRole` is the first statement in both page files. Smoke shows redirects on every out-of-scope combination. |
| I-idem-submit-time | Idempotency-Key generated per submit, not per mount | Line numbers: both forms generate at `handleSubmit` body, not at module/closure scope. |

### Known gaps (non-blocking)

1. **Forms accept raw numeric IDs** — the pm/gm user types `userId` and `bonusIds` as numbers. There's no autocomplete / user-picker / bonus-picker widget. This was explicitly scoped out ("no heavy UI"). A follow-up UI tranche can add selectors; the API contract is already forward-compatible.
2. **Inline error display is a plain span** — no toast, no banner. Matches the directive ("minimal, not analytics"). Users see the Arabic error with code + HTTP status, which is sufficient for pm/gm operators.
3. **No loading skeletons or optimistic UI**. Forms show a simple "جارٍ الإرسال..." disabled button state. Sufficient for Phase 4 closure scope.
4. **Smoke transcripts are not archived in the repo** — the temp smoke scripts were deleted after capture. The values in §7 are copy-pasted from the live run; they can be reproduced by anyone with DB access + the seed snippet in §7's prose.

### Why each gap is non-blocking

All four are intentional scope restrictions from the Phase 4.4.1 directive ("no heavy UI", "no new tests", "minimal"). None of them affect correctness — the API layer is the source of truth and is fully tested by Phase 4.4's 26 integration cases.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green + runtime smoke matches contract on all 5 points.

### الشروط

- Commit محلي فقط.
- Phase 4.5 (Step 3 — Avoir core) لا يبدأ قبل مراجعة صريحة لهذا الـ 4.4.1.

---

## 14. ملاحظة صدق

الترانش نفَّذت الإصلاح الدقيق الذي طلبه المراجع بـ file+line:

1. صفحة `/settlements` اكتملت فعلياً: جدول + نموذجان (تسوية + مكافأة). ما كان "shell" توثيقياً أصبح UI عاملاً يستهلك نفس `/api/v1/settlements` المُختبَر في 4.4.
2. صفحة `/my-bonus` تمرّ الآن حرفياً عبر `/api/v1/bonuses` بالـcookie-forwarding النمطي في Next.js App Router. استيراد `listBonuses` من `service` حُذف، وgrep يؤكد صفر references على هذا الاستيراد داخل `src/app/**`.
3. `nav-items.ts` مُوائَم مع العقد: `/settlements` خرج من manager، `/my-bonus` دخل لـ seller + driver.

التعديلان الإلزاميان من مراجعة العقد نُفِّذا:
- **Idempotency-Key** في كلا النموذجين تُولَّد داخل `handleSubmit` في كل submission (السطر 39 في settlement، السطر 28 في reward). لا module-level، لا `useState` init.
- **Smoke evidence** مُوثَّقة بدقة في §7: 5 أدوار × 2 صفحات = 10 اختبارات منفصلة، كلها مطابقة للعقد. grep على الكود يؤكد canonical API usage و submit-time key generation.

لا توسّع خارج الثلاث نقاط. لا business logic مُعدَّل. لا API contracts مُعدَّلة. لا schema. لا push. 276/276 integration tests على Neon حيّ، صفر regression.
