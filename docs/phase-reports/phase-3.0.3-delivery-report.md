# Phase 3.0.3 Delivery Report — Decouple test:unit from test:integration

> **Template**: D-78 §5 (13-section).
> **Type**: Infra patch — closes the last reviewer objection against Phase 3.0: both Gate 5 and Gate 6 are now reproducibly green from the repo's own scripts, with no cross-contamination.

---

## 1. Delivery ID

- **Date**: 2026-04-20 ~07:15 (Europe/Paris)
- **Base commit**: `1c93241` (Phase 3.0.2)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **3.0.3 — unit / integration gate separation**

---

## 2. Scope

### ما تغيَّر

**[`package.json`](../../package.json)** — `test:unit` script now scoped to `src/` only:
```diff
- "test:unit": "vitest run --coverage",
+ "test:unit": "vitest run src/ --coverage",
```

Positional `src/` filters collection to unit test files (`src/**/*.test.ts`). Vitest still consults `vitest.config.ts` `include`, but the positional argument takes precedence as a path filter. Integration tests living under `tests/integration/**` are not collected.

**[`tests/integration/setup.ts`](../../tests/integration/setup.ts)** — env loader is now opt-in:
```diff
+ function shouldLoadDotenvLocal(): boolean {
+   if (process.env.LOAD_INTEGRATION_ENV === "1") return true;
+   if (process.env.npm_lifecycle_event === "test:integration") return true;
+   return false;
+ }

  function loadDotenvLocal(): void {
+   if (!shouldLoadDotenvLocal()) return;
    const envPath = path.join(process.cwd(), ".env.local");
    ...
  }
  loadDotenvLocal();
```

Two opt-in signals (belt-and-suspenders):
- **`npm_lifecycle_event === "test:integration"`** — npm sets this automatically for any script invocation. Covers the developer's `npm run test:integration` path without needing extra flags.
- **`LOAD_INTEGRATION_ENV=1`** — explicit opt-in for CI or direct `npx vitest` invocations that bypass npm scripts.

Neither signal is set during `npm run test:unit` or `npm test`, so integration setup code is fully inert in those contexts.

### ما لم يتغيَّر

- Zero logic changes. No schema, no migrations, no service behaviour, no DTOs, no routes.
- No new dependencies.
- No change to `vitest.config.ts` include/exclude lists.
- `.env.local` untouched and still gitignored.

---

## 3. Business Impact

- **Both acceptance gates are now repo-canonical and decoupled**. A reviewer can run:
  - `npm run test:unit` → 182/182 green, no integration-suite leakage, no DB needed.
  - `npm run test:integration` → 106/106 green on live Neon test branch (with `.env.local` present).
- **CI workflow stays trivial**. Standard `npm run test:unit` and `npm run test:integration` as separate steps. The integration step provisions `TEST_DATABASE_URL` via secret; the unit step doesn't need any secret.

---

## 4. Technical Impact

### Files

| Category | Modified |
|---|---:|
| `package.json` (test:unit script scoping) | 1 |
| `tests/integration/setup.ts` (opt-in env loader) | 1 |
| `docs/phase-reports/phase-3.0.2-delivery-report.md` (errata) | 1 |
| `docs/phase-reports/phase-3.0.3-delivery-report.md` (new) | 1 new |
| **Total** | **3 modified + 1 new** |

### No behavioural change to any runtime code path.

---

## 5. Risk Level

**Level**: 🟢 **Low**

- `test:unit` script change is a single positional arg addition; vitest handles positional paths well and we already rely on this pattern for `test:integration`.
- The env-load guard is a 3-line boolean check; it degrades gracefully (env simply not loaded) for any invocation that doesn't match the opt-in.
- No production code touched.

---

## 6. Tests Run (Local — 2026-04-20 07:15)

### 13-gate status

| # | Gate | Type | Phase 3.0.2 → Phase 3.0.3 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS |
| 2 | Lint | ✅ real | PASS 0/0 |
| 3 | Typecheck | ✅ real | PASS |
| 4 | Build | ✅ real | 41 routes (unchanged) |
| 5 | **Unit + coverage** | ✅ **real, repo-script-green** | `npm run test:unit` → **182/182 passed (22 files)**; coverage Stmt 92.3% / Branches 87.91% / Funcs 96.49% / Lines 93.08%. **Zero integration leakage.** |
| 6 | **Integration** | ✅ **real, live DB, repo-script-green** | `npm run test:integration` → **106/106 passed (15 files)**. Zero skipped. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS |
| 9–13 | placeholder | ⏸ | — |

### Canonical gate commands

```bash
# Unit — no DB needed
npm run test:unit

# Integration — requires .env.local with TEST_DATABASE_URL
npm run test:integration
```

Neither command requires shell env loading, custom flags, or positional overrides. Both are canonical.

### Evidence matrix

| Scenario | Before 3.0.3 | After 3.0.3 |
|---|---|---|
| `npm run test:unit` | 14 failed suites / 6 failed / 184 passed / 98 skipped (integration leaked in) | **22 files / 182 tests / all green** |
| `npm run test:integration` | 15/15 files / 106/106 tests (green from 3.0.2) | **15/15 files / 106/106 tests — unchanged** |

### Unit test count (182 vs 184)

Previous reports claimed 184 unit tests. Actual: 182. The "184" number was inflated by 2 tests from `tests/integration/health.test.ts` (a DB-less health-check suite that doesn't use `skipIf`). That suite is correctly classified as integration-territory by directory and now excluded from `test:unit`. Net true unit count: **182 passed / 0 failed**.

---

## 7. Regression Coverage

- [✅] Phase 2 / 2c.1 / 3.0 / 3.0.1 business logic — unchanged (no code touched).
- [✅] Phase 3.0.2 env-load for integration — unchanged outcome (integration still loads env from `.env.local`), but now via the explicit opt-in path.
- [✅] Coverage excludes still correct; no file newly qualifies for inclusion/exclusion.

---

## 8. API Impact

None.

---

## 9. DB Impact

None.

---

## 10. Security Check

- The opt-in env-load guard is strictly defensive — it reduces the chance of stray env loading in unexpected script paths.
- `.env.local` still gitignored. `git check-ignore .env.local` → ignored.
- No new env reads; no new secret surface.

---

## 11. Performance Check

- `npm run test:unit` now runs faster (doesn't attempt integration suites + cold-start misses). ~3s for 182 tests.
- `npm run test:integration` unchanged (~375s for 106 tests on live Neon).

---

## 12. Known Issues & Accepted Gaps

1. **`npm test` (no arg) still loads everything and will misbehave** if `.env.local` is present. The `test` script is not in the canonical gate set (Gate 5 uses `test:unit`, Gate 6 uses `test:integration`). Leaving `test` as-is to avoid surprising developers who use it loosely. If reviewer wants it neutered, one more one-line patch.
2. **Flaky first-run on very cold Neon endpoints**: observed one transient 2-test failure during debugging due to 30s cold-start exceeding the per-test timeout after idle. Second run passed 106/106. The 30s test-timeout + 120s hook-timeout budget is comfortable on warm endpoints; if Neon's cold-start p99 regresses beyond 30s, revisit.
3. **Unit-count rebaseline**: historical reports showing 184 are now superseded by the accurate 182 (two tests were in `tests/integration/health.test.ts`, re-classified to integration by directory).

### Resolved in Phase 3.0.3

- ✅ `npm run test:unit` is repo-canonical green, no integration leakage.
- ✅ `npm run test:integration` is repo-canonical green, unchanged from 3.0.2.
- ✅ Gate 5 + Gate 6 fully decoupled; env load only happens on integration invocations.
- ✅ Phase 3.0.2 report errata documents the broken-gate-5 moment between commits.

---

## 13. Decision

**Status**: ✅ **ready** — both Gate 5 and Gate 6 are now repo-canonical and reproducible.

### الشروط

- Commit locally; no push per user directive.
- Phase 3 follow-up tranches (discount engine, VIN, gift_pool, commission snapshots, then Phase 4) remain blocked until reviewer approval of 3.0.3.
- CI workflow when provisioned: two steps — `test:unit` and `test:integration` — with `TEST_DATABASE_URL` secret only needed on the integration step.

---

## 14. ملاحظة صدق

The reviewer's chain of objections was each time precise:
- 3.0.1: ownership/sign-guard/hash-chain-race/refCode gaps — real, fixed.
- 3.0.2: Gate 6 reached via manual command, not script — real, fixed.
- 3.0.3: fixing Gate 6 through unconditional env load broke Gate 5 — real, fixed.

Each patch was narrowly scoped and verifiable. The common theme: **what the report claims must be reproducible from the repo itself, straight from `npm run <script>`**. That's now true for all canonical gates.

What I tried and reverted: none. What I almost got wrong: relying on the env-load to always run from setup.ts module-load was too aggressive; the opt-in guard is the right boundary. What's left: the `npm test` alias still tries to run everything (documented as a known gap in §12.1; would take 30 seconds to fix if the reviewer wants it addressed).

Lint + typecheck + build (41 routes) + db:migrate:check + **`npm run test:unit` 182/182 green** + **`npm run test:integration` 106/106 green, both straight from the repo scripts with no shell tricks or custom flags**. Coverage 92.3%/87.91%. Working tree clean after commit. `.env.local` gitignored. No push.
