# Phase 1a.1 Delivery Report — Test proof-layer corrections

> **Template**: D-78 §5 (13-section).
> **Type**: Short follow-up to Phase 1a. Fixes test-proof layer only — no new business logic.
> **Scope discipline**: intentionally narrow; only 3 changes: env cache reset, init test hardening, auth-round-trip Group B.

---

## 1. Delivery ID

- **Date**: 2026-04-19 ~19:43 (Europe/Paris)
- **Base commit**: `b248f95` (Phase 1a)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **1a.1 — test proof-layer corrections** (no runtime behavior change)

---

## 2. Scope

### ما تغيَّر

- `src/lib/env.ts` — adds `resetEnvCacheForTesting()` (test-only export; no production call-site). Fixes a latent bug in Phase 1a tests where the cached env snapshot masked later `process.env` mutations — causing some assertions to pass for the wrong reason.
- `tests/integration/init.test.ts` — rewrites to:
  - Flush env cache in `beforeEach`.
  - Use `vi.resetModules()` + re-import the route after env changes (defense-in-depth).
  - Add DB-level assertions ("no user inserted") on 401 paths so the test proves the gate actually gates — not just that a 401 came back.
  - Add a 6th case: **production without `INIT_BOOTSTRAP_SECRET` → 503 `INIT_DISABLED`** (was implemented in Phase 1a route code but was untested).
  - Use `vi.stubEnv("NODE_ENV", "production")` (TypeScript-clean) instead of direct assignment.
- `tests/integration/auth-round-trip.test.ts` — split into two explicit groups:
  - **Group A — seed verification** (the 6 cases Phase 1a shipped, renamed to reflect reality).
  - **Group B — credentials → authorize → jwt → session** (new; 8 cases). This is what the file name *"round-trip"* implied but Phase 1a did not actually exercise. Phase 1a.1 makes the name honest.

### Group B coverage (new in Phase 1a.1)

| Case | What it proves |
|---|---|
| correct admin credentials → authorized user | End-to-end: DB row → Argon2id verify → user object shape that matches Auth.js contract. |
| wrong password → null | `verifyPassword` false-path; no row leak. |
| unknown username → null | Empty-result path. |
| missing credentials → null × 3 | Zod-equivalent validation branches. |
| inactive user → null | `active=false` short-circuit before password verify. |
| jwt callback populates token | `authConfig.callbacks.jwt` — the real callback, invoked directly. |
| session callback copies claims | `authConfig.callbacks.session` — the real callback. |
| getSessionClaims extracts typed claims | `src/lib/session-claims` with a mocked `auth()` that mirrors the session shape the session callback just produced. |

**What Group B still does NOT prove**: Next.js HTTP pipeline end-to-end (cookie jar, middleware invocation, route handler access with a real session cookie). That remains E2E territory (Playwright, Phase 1+ deferred per D-71).

### ما لم يتغيَّر

- Phase 0, Phase 1, Phase 1a source files — untouched.
- Runtime behavior of `/api/init`, `/api/health`, middleware, auth callbacks — untouched.
- Schema, migrations, CI workflow — untouched.

---

## 3. Business Impact

None user-visible. The admin bootstrap flow and login behavior are byte-identical to Phase 1a.

**Proof quality** improved: Phase 1a had a false-green risk on the init secret tests (cached env could mean the gate was never exercised). Phase 1a.1 removes that false-green.

---

## 4. Technical Impact

- Files modified: 3
  - `src/lib/env.ts` — +12 lines (new function + doc comment).
  - `tests/integration/init.test.ts` — rewritten; 6 cases (was 5).
  - `tests/integration/auth-round-trip.test.ts` — rewritten; 14 cases in 2 groups (was 6).
- Files added: 0.
- Files removed: 0.
- Migrations: 0.
- Endpoints: 0 changes.

---

## 5. Risk Level

**Level**: 🟢 **Low**

**Reason**:
- Test-only changes + one test-only export.
- No route handler, middleware, or schema touched.
- Runtime paths unchanged; only the way tests exercise them is tightened.

---

## 6. Tests Run (Local — 2026-04-19 19:43)

### 13-gate status (unchanged count; strictness improved)

| # | Gate | Type | Result (Phase 1a → Phase 1a.1) |
|---|------|:-:|:-:|
| 1 | Lockfile | real | ✅ → ✅ |
| 2 | Lint | real | ✅ 0/0 → ✅ 0/0 |
| 3 | Typecheck | real | ✅ → ✅ |
| 4 | Build | real | ✅ 10 routes → ✅ 10 routes (unchanged) |
| 5 | Unit + coverage | real | 68/68, 90.25% stmt → **68/68, 90.25% stmt (unchanged)** |
| 6 | Integration | real | 2 pass + 11 skipped (13 cases) → **2 pass + 20 skipped (22 cases)** |
| 7 | OpenAPI drift | placeholder | ⏸ → ⏸ |
| 8 | db:migrate:check | real | ✅ → ✅ |
| 9–13 | placeholder | ⏸ → ⏸ |

### Integration case growth

- Phase 1a: 13 cases total (2 pass, 11 skipped).
- Phase 1a.1: **22 cases** total (2 pass, 20 skipped).
  - `init.test.ts`: 5 → 6 cases (+1: production 503).
  - `auth-round-trip.test.ts`: 6 → 14 cases (+8: Group B credentials chain).
- When `TEST_DATABASE_URL` is provisioned in CI, **all 20 skipped cases execute**. Phase 1a.1 meaningfully increases the test surface that auto-activates under CI secret.

### العدّ الصادق (updated)

- **Real gates**: 7/13 (unchanged vs Phase 1a).
- **Placeholder gates**: 6/13 (unchanged).
- **Unit + integration cases total**: 90 cases (unit 68 + integration 22); of those 70 execute without DB.

### CI run on GitHub

Still not run (no push per user directive).

---

## 7. Regression Coverage

- [~→~+] login / session / claims — previously unit-mocked only. Now covered by Group B (exercises real Auth.js callbacks + real DB admin row). Still **not** a full HTTP round-trip (that's E2E).
- [✅] /api/health reachability — unchanged (still covered by health.test.ts without DB).
- [~→~+] /api/init hardening — was 3 gate checks; now 4 gate checks (adds production 503) + all 4 verify no-DB-work on auth-fail.
- [⏳] order/delivery/invoice/treasury — still Phase 3+.
- [~] /api/v1/* compat — only /api/v1 endpoint removed in Phase 1a (health); no new v1 endpoints yet.
- [~] Android-readiness — unchanged.

---

## 8. API Impact

None. No endpoints added, changed, or removed.

---

## 9. DB Impact

None. No migrations, no schema changes.

---

## 10. Security Check

- Auth: unchanged.
- Permissions: unchanged.
- Secrets: `INIT_BOOTSTRAP_SECRET` — same behavior as Phase 1a; additional test coverage only.
- Destructive paths: `/api/init` gate now verified by tests to block DB work on auth failure.

---

## 11. Performance Check

- Test suite: +~20 cases added; total runtime increase for `npm run test`: negligible (< 100ms).
- Build: unchanged.
- Runtime: unchanged.

---

## 12. Known Issues & Accepted Gaps

### Accepted

1. **Group B does not drive HTTP round-trip**. It invokes `authorize()` logic and `authConfig.callbacks.{jwt,session}` directly. Real HTTP end-to-end (cookie jar, middleware invocation, protected route access) needs Playwright. Deferred per D-71. The report does NOT claim E2E proof.
2. **20/22 integration cases skip locally without `TEST_DATABASE_URL`**. CI flips them to real once the secret is provisioned.
3. **Authz matrix dedicated suite (Gate 9)** still placeholder. auth-round-trip Group A exercises authz indirectly. Phase 2 may add a dedicated 6×resources×actions `tests/authz/` suite.
4. **Gate 10 regression pack**, **Gate 11 E2E**, **Gate 12 perf**, **Gate 13 a11y/logs** — all still placeholders per D-78 §Exceptions.
5. **Next.js middleware → proxy.ts migration** — still deferred to Phase 2.

### Not hidden

- No UI polish (login form still minimalist).
- Sidebar still static from `NAV_BY_ROLE`.
- `/api/init` still returns plaintext admin password on first success (D-24 design).

---

## 13. Decision

**Status**: ✅ **ready** (local checkpoint on top of Phase 1a).

### الشروط

- Commit locally; no push.
- Phase 2 can now start.
- When `TEST_DATABASE_URL` lands in CI: 20 skipped cases auto-activate; no code change needed.

### Post-delivery monitoring

N/A (no production deploy).

---

## 14. ملاحظة صدق

**What this delivery actually is**: test-proof hardening. Phase 1a's tests had a latent bug (env singleton) that could produce false-green results on the init hardening assertions, and its `auth-round-trip.test.ts` tested seed state rather than the credentials chain its name implied. Phase 1a.1 fixes both — surgically.

**What this delivery is NOT**: a new feature, a schema change, or a middleware/route behavior change. Nothing production-facing moved.

**Over-claim avoided**: Group B uses the `authorize` logic and real Auth.js callbacks. It stops short of a full HTTP round-trip. The test file name is now honest (Group A is seed verification, Group B is the credentials chain). No "proves complete auth flow" claim; only "proves the data chain produces correct claims".

Phase 2 now has a cleaner base to build on.
