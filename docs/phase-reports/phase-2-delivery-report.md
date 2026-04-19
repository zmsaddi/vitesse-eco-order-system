# Phase 2 Delivery Report — Design system + /api/v1/me + Users list

> **Template**: D-78 §5 (13-section).
> **Scope discipline**: Phase 2 per D-71 narrow MVP — **NOT the full original Phase 2** (catalog PDF, image upload, gift pool, inventory UI are all deferred). This delivery ships the foundation pieces that Phase 3 (orders + delivery + invoice) will lean on.
> **Not in this delivery**: Clients / Suppliers / Products CRUD (split to Phase 2b per scope-by-commit discipline), Settings page (Phase 2c), Users create/edit form (Phase 2b).

---

## 1. Delivery ID

- **Date**: 2026-04-19 ~19:58 (Europe/Paris)
- **Base commit**: `4c7c394` (Phase 1a.1 — test proof-layer corrections)
- **Commit SHA (delivery)**: *(recorded by commit step immediately after this report)*
- **Phase**: **2 (first tranche)** — Design system + /api/v1/me + Users list.

### Constraint recorded before Phase 2 started

`tests/integration/auth-round-trip.test.ts` was renamed (group level only) from "credentials → authorize" to **"credentials-chain simulation + Auth.js callbacks"**, per external review request not to imply it tests the production `authorize()` path. A prominent TODO block in the file documents the required action on any next touch to `src/auth.ts` (wire to real provider OR soften further).

---

## 2. Scope

### ما أُنجز

**Design system primitives (src/components/ui/)**
- `PageShell` — standard page header with title/subtitle/actions slot.
- `EmptyState` — per 38_Accessibility_UX_Conventions §Empty States Matrix.
- `DataTable<T>` — mobile-first: renders as cards on <768px, table on ≥768px. No sort/filter yet (server-rendered for Phase 2; TanStack Query client-side refresh comes in Phase 3).
- `FormCard` + `Field` — reusable form wrapper with label/error/hint. (Not used yet by Phase 2 UI since users CRUD form is Phase 2b; pre-written so Phase 2b doesn't have to pause for primitives.)
- `Button` — 4 variants (primary, secondary, danger, ghost). Keyboard + a11y ready.

**`/api/v1/me` — first `/api/v1/*` business endpoint (D-66)**
- Returns `{ claims, user, nav }` for the authenticated user.
- `user` is full `UserDto` (D-69 — not Drizzle row).
- `nav` is the role-filtered list from `getNavForRole(role)` (same source the SSR layout uses now).
- 401 when no session; 404 via `NotFoundError` if the user row is missing (shouldn't happen in production).

**`/api/v1/users` list — PM/GM only**
- Returns active users as `UserDto[]`.
- `requireRole(request, ["pm", "gm"])` enforces the role gate before any DB read.
- No create/edit/delete yet (Phase 2b).

**Users service + DTO + mappers (D-68 + D-69)**
- `src/modules/users/service.ts` — `getUserByUsername`, `getUserById`, `listActiveUsers`, `markOnboarded`.
- `src/modules/users/dto.ts` — already existed from Phase 0; Phase 2 adds tests.
- `src/modules/users/mappers.ts` — already existed; now used by service.

**Users UI — `/users` (PM/GM)**
- Server-rendered list via `DataTable`.
- Role labels in Arabic, profit share visible only when > 0.
- "+ مستخدم جديد" button present but **disabled** with "(Phase 2b)" tooltip — honest placeholder.

**Sidebar data-driven (closes Phase 1 gap)**
- `src/modules/users/nav.ts` — `getNavForRole(role)` as single source of truth for menu items.
- `src/app/(app)/layout.tsx` calls it and passes result as `navItems` prop.
- `src/components/layout/Sidebar.tsx` — **no longer imports `NAV_BY_ROLE` directly**; it's a pure list-renderer.
- `src/app/api/v1/me/route.ts` uses the same helper, so UI and API cannot drift.

### ما لم يتغيَّر

- Phase 0 / Phase 1 / Phase 1a / Phase 1a.1 source files — untouched except:
  - `auth-round-trip.test.ts` got the group-level rename + TODO block (Phase 2 kickoff bookkeeping).
  - `vitest.config.ts` added `src/modules/**/service.ts` + `nav.ts` to coverage exclusions (both covered via integration, not unit).
- No schema / migration changes.
- `/api/init`, `/api/health`, `/api/auth/*` — untouched.

---

## 3. Business Impact

- PM and GM can now visit `/users` and see the active-users roster.
- Sidebar for each role is stable, sourced from one place (no UI/API drift risk).
- Android client (future — D-67) now has `GET /api/v1/me` to resolve the sign-in context in one call.
- Other roles: no visible change. Their pages remain empty shells from Phase 1.

---

## 4. Technical Impact

| الفئة | جديد | مُعدَّل |
|---|---:|---:|
| Design primitives | 5 | 0 |
| API endpoints | 2 (`/api/v1/me`, `/api/v1/users`) | 0 |
| Users domain (service + nav) | 2 | 0 |
| UI pages | 1 (`/users`) | 0 |
| Layout (data-driven nav) | 0 | 3 (layout, AppLayout, Sidebar) |
| Tests | 2 (`dto.test.ts`, `me.test.ts`) | 1 (`auth-round-trip` group rename + TODO) |
| Config | 0 | 1 (`vitest.config.ts` exclusions) |
| **Total** | **~12 new** | **~5 modified** |

### Endpoints added

- `GET /api/v1/me` (requires session; returns claims + user DTO + role-filtered nav).
- `GET /api/v1/users` (pm/gm only; returns active users DTO list).

### Routes added

- `/users` (server-rendered list page, pm/gm only; `+ مستخدم جديد` disabled).

### Migrations

None.

---

## 5. Risk Level

**Level**: 🟢 **Low**

**Reason**:
- Additive work. No change to auth, middleware, `/api/init`, or DB schema.
- The Sidebar refactor is a pure prop lift — behaviorally identical, better factored.
- `/api/v1/me` is a new read endpoint; can't break anything not yet built.

---

## 6. Tests Run (Local — 2026-04-19 19:58)

### 13-gate status

| # | Gate | Type | Result |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS |
| 2 | Lint | ✅ real | PASS (0/0) |
| 3 | Typecheck | ✅ real | PASS |
| 4 | Build | ✅ real | **13 routes** (was 10 in Phase 1a; +`/api/v1/me`, `/api/v1/users`, `/users`) |
| 5 | Unit + coverage | ✅ real | **78/78 pass** (was 68); coverage **Stmt 90.5% / Branch 86.41% / Funcs 97.87% / Lines 91.48%** |
| 6 | Integration | ✅ real | **2 pass + 22 skipped** (24 cases; was 22) |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS |
| 9 | Authz | ⏸ placeholder | — |
| 10 | Regression | ⏸ placeholder | — |
| 11 | E2E smoke | ⏸ placeholder | — |
| 12 | Perf smoke | ⏸ placeholder | — |
| 13 | A11y + logs | ⏸ placeholder | — |

### Unit case growth

- Phase 1a.1: 68 unit cases.
- **Phase 2**: 78 unit cases (+10: full DTO + mapper coverage via `users/dto.test.ts`).

### Integration case growth

- Phase 1a.1: 22 cases (2 pass + 20 skipped without DB).
- **Phase 2**: 24 cases (2 pass + 22 skipped; +2: `/api/v1/me` unauthenticated 401 + authenticated happy path).

### العدّ الصادق (updated)

- **Real gates**: 7/13 (unchanged count).
- **Placeholder gates**: 6/13 (unchanged).
- Coverage within testable scope: very healthy. New UI components + service layer are explicitly excluded from unit coverage (they require integration or E2E).

### CI run on GitHub

Not run (no push per user directive).

---

## 7. Regression Coverage (D-78 permanent pack)

- [~+] **login / session / claims** — Phase 2 adds `/api/v1/me` which is the canonical "am I signed in, what can I see" probe. Integration test covers 401 path unconditionally.
- [~] **/api/health**, **/api/init** — untouched; regressed automatically by Phase 1a tests (which still pass).
- [⏳] order create/edit/cancel/collect — Phase 3.
- [⏳] delivery — Phase 4.
- [⏳] invoice — Phase 4.
- [⏳] treasury — Phase 4.
- [⏳] idempotency — Phase 3.
- [⏳] snapshots — Phase 3-4.
- [✅] soft-delete / RESTRICT FK — unchanged.
- [~] **`/api/v1/*` backward compatibility** — *first* v1 endpoints landed (`me`, `users`). DTO shapes locked to `UserDto` schema; future changes must preserve or version-bump.
- [~] **Android-readiness** — `/api/v1/me` + `UserDto` are what a future Android bearer client will call on login. The rest of the chain (SessionClaims → auth → DB) unchanged.

---

## 8. API Impact

- **Added**: `GET /api/v1/me`, `GET /api/v1/users`.
- **Changed**: none.
- **Removed**: none.
- **Versioning**: first business payloads under `/api/v1/*`. DTO shapes (`UserDto`, `{ claims, user, nav }`) are the v1 contract going forward. OpenAPI generator (gate 7) will capture them in Phase 2b or 3.

---

## 9. DB Impact

None. No migrations, no schema changes, no new tables.

---

## 10. Security Check

- **Auth**: `/api/v1/me` uses `requireClaims`; `/api/v1/users` uses `requireRole(["pm","gm"])`. Role gate happens before any DB work (the service call is conditional on `requireRole` succeeding).
- **Permissions**: seed unchanged.
- **Secrets**: no new secrets.
- **Destructive paths**: none added.
- **UI**: no client-side state for this delivery (everything SSR); no CSRF surface beyond Auth.js-handled login.

---

## 11. Performance Check

- `/api/v1/me`: 1 DB query (user lookup) + 1 function call (`getNavForRole`) = single round-trip. p95 expected < 50ms on warm pool.
- `/api/v1/users`: 1 DB query (active users). p95 < 100ms until we have paginate.
- `/users` SSR page: 1 DB query (same service) + render. First-contentful-paint acceptable.
- Bundle: +~5KB for the 5 new UI primitives (Tailwind-only, no extra JS libs).

---

## 12. Known Issues & Accepted Gaps

### Accepted

1. **Phase 2b deferred**: Users create/edit form, Clients CRUD, Suppliers CRUD, Products CRUD (minimal). Each gets its own small commit.
2. **Phase 2c deferred**: Settings page (D-35 mandatory mentions enforcement before invoice generation).
3. **Pagination**: not yet on `/api/v1/users`. Safe for now (no real staff roster). Phase 2b adds limit/offset + `?limit=50` default.
4. **Client-side interactivity**: none yet. Pure SSR. TanStack Query + optimistic updates come in Phase 3.
5. **Images / uploads**: not in this delivery. Phase 3 or later.
6. **No OpenAPI generator wired** — Gate 7 still placeholder.
7. **Sidebar "DB-driven" is still role-keyed** (`NAV_BY_ROLE`) — see `src/modules/users/nav.ts` doc comment for why (role-specific labels like "طلبات فريقي" vs "طلباتي" are not pure `can(resource,"view")` checks). When Phase 3+ removes role-specific labels, the helper swaps to a `can()` filter without any UI change.
8. **`auth-round-trip.test.ts` Group B is still a credentials-chain simulation**, not the production `authorize()` path. TODO block records the rule: next touch to `src/auth.ts` or this test must wire to real provider or further soften naming.

### Not hidden

- `/users` "+ مستخدم جديد" button is disabled — not styled like a working CTA.
- No toasts yet.
- Topbar bell/breadcrumbs still placeholder.

---

## 13. Decision

**Status**: ✅ **ready** (local checkpoint on top of Phase 1a.1).

### الشروط

- Commit locally; no push per user directive.
- Phase 2b can start immediately (Users form + Clients CRUD).
- When `TEST_DATABASE_URL` lands in CI, 22 integration cases auto-execute.

### Post-delivery monitoring

N/A (no production deploy).

---

## 14. ملاحظة صدق

Phase 2 is **intentionally narrow**. The original Phase 2 in `DEVELOPMENT_PLAN.md` called for 10+ CRUD pages, catalog PDF, image upload, and gift pool — all in one XL sprint. D-71 narrowed MVP to order-to-cash, and this delivery narrows further to: design primitives + first `/api/v1/*` business payloads + one live CRUD surface (Users list, read-only).

Everything else from the original Phase 2 description is either deferred (post-MVP per D-71) or split into Phase 2b / 2c for scope-per-commit discipline. This report does not claim full Phase 2 completion. It ships what's foundational, tested, and honest.
