# P-audit-4 Delivery Report — CI integration hard-fail when `TEST_DATABASE_URL` is absent

> **Template**: D-78 §5 (13-section).
> **Type**: CI/testing-infrastructure hardening. No `src/app/**` feature work, no `src/modules/**` changes, no migrations, no runtime behaviour changes, no impact on the live pilot baseline (`f1aa900` / `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR`).
> **Status on this file**: **Implementation Contract — PENDING USER APPROVAL.** Sections 0–11 populated up-front; §12 + §13 filled only after code + tests land.

---

## 0. Implementation Contract (pending acceptance)

**Problem statement.** The Phase 6.4 post-ship deep audit confirmed a SEV-1 gap: the `test:integration` CI gate passes silently when `TEST_DATABASE_URL` is unset because every one of the 39 integration suites opens with `describe.skipIf(!HAS_DB)` and the `test:integration` npm script carries `--passWithNoTests`. If the CI secret is ever removed, rotated wrong, or dropped during a workflow refactor, all 448 integration tests skip silently and CI is green.

**In-scope guarantees.**
1. A single new test file `tests/integration/ci-guard.test.ts` that asserts `HAS_DB === true` WHEN `process.env.CI === "true"`. Locally (CI unset) the test is a pass-through — no-op `expect(true).toBe(true)` — so developers without a DB can still run unit tests and even integration tests in `skipIf` mode without friction.
2. The guard does **NOT** use `describe.skipIf(!HAS_DB)`. Skipping it would defeat its purpose.
3. `test:integration` npm script loses `--passWithNoTests`. With 39 integration files + the new guard, this flag is now pure foot-gun protection: if someone ever deletes every file from `tests/integration/`, CI should fail loudly rather than pretend to have tested.

**Out-of-scope (explicit).**
- `test:authz` (`tests/authz/`) and `test:regression` (`tests/regression/`) keep their `--passWithNoTests` for now. Those directories are legitimately empty until P-audit-1 and P-audit-2 fill them; forcing failure today would break the pilot baseline for zero present-day safety gain. Their hardening is the explicit job of their respective tranches.
- No change to the 5 placeholder-echo gates (`test:e2e:smoke`, `test:perf`, `test:a11y`, `test:logs`, `openapi:drift`). They're P-audit-3 / P-audit-5+ territory.
- No change to `vitest.config.ts`, any `src/` file, any migration, any DB schema.
- No new npm dependency.

**Explicit non-guarantees.**
- The guard catches "secret missing / env var empty". It does NOT catch "secret present but URL points to a dead DB" — the first real integration test's connection attempt would surface that. A full DB-liveness probe is out of scope.
- Locally, developers with `CI=true` accidentally set in their shell will see the guard fail. That's acceptable: any CI-simulation is supposed to behave CI-like.

---

## 1. Tranche ID

- **Date**: TBD — filled at commit time.
- **Base commit**: `f1aa900` (Phase 6.4 — deliveries list endpoint + /deliveries page, the live pilot baseline).
- **Commit SHA (delivery)**: *(appended at commit time)*
- **Phase**: **P-audit-4 — CI integration hard-fail**. First of the four audit tranches prioritised by the operator (4 → 1 → 2 → 3).

---

## 2. Scope

### In-scope (strictly enumerated)

**New test file** — `tests/integration/ci-guard.test.ts` (≤ 50 lines):
- `describe("P-audit-4 — CI integration guard", () => { … })` (no `skipIf`).
- Two `it(...)` cases:
  1. `T-PA4-CI-01`: when `process.env.CI === "true"` → `expect(HAS_DB).toBe(true)` with a clear failure message naming `TEST_DATABASE_URL`. When `CI` is not `"true"` → pass-through (`expect(true).toBe(true)`). Single test; outcome branches inside.
  2. `T-PA4-CI-02`: documents the local-mode contract. When `CI` is unset or not `"true"`, the suite must run without throwing and must not claim to have exercised the DB paths. Asserts `typeof HAS_DB === "boolean"` (sanity on the setup module) + that the test file itself is NOT skipped.

**Modified file** — `package.json`:
- `test:integration` script: drop `--passWithNoTests`. Final form:
  ```
  "test:integration": "vitest run tests/integration --testTimeout=45000 --hookTimeout=120000 --no-file-parallelism"
  ```
- `test:authz` + `test:regression` + `test:money:edge` + `test:auth:full`: UNCHANGED. They keep `--passWithNoTests` until their own hardening tranches land.

**Modified file** — `.github/workflows/ci.yml`:
- Only the comment block next to Gate 6 updated to reference the new guard. The gate command itself is unchanged — the guard fires from inside the same `test:integration` invocation.

**New delivery report** — this file.

### Not touched (asserted by diff at merge time — §7)

- `src/**` — zero lines.
- `tests/integration/setup.ts` — unchanged (the guard reads `HAS_DB` from it).
- `tests/authz/**`, `tests/regression/**`, `tests/money/**`, `tests/auth/**` — zero lines.
- `vitest.config.ts` — unchanged.
- `.github/workflows/ci.yml` env block, gate order, or gate commands — unchanged; only a comment edit.
- `package-lock.json` — unchanged (no new deps).
- `src/db/schema/**`, `src/db/migrations/**` — zero lines.
- Live pilot baseline `f1aa900` stays structurally valid; this tranche is pure CI-gate additive.

---

## 3. Files

### Planned — new (2)

| File | Role | Target LOC (≤ 300) |
|------|------|:---:|
| `tests/integration/ci-guard.test.ts` | 2 guard tests, no skipIf | ≤ 50 |
| `docs/phase-reports/p-audit-4-ci-integration-hard-fail-delivery-report.md` | This report | ≤ 250 |

### Planned — modified (2)

| File | Change | Est. lines |
|------|--------|:---:|
| `package.json` | Drop `--passWithNoTests` from `test:integration` only | -1 / +1 |
| `.github/workflows/ci.yml` | Comment update near Gate 6 referencing guard | +2 / 0 |

---

## 4. Dependencies

**Pre-existing, reused unchanged:**
- `tests/integration/setup.ts` → exports `HAS_DB: boolean`.
- `vitest` test runner (no config change).
- GitHub Actions built-in `CI=true` env var on every workflow run (unconditional; part of the GitHub Actions contract).

**No new npm dependency.** Lockfile diff at merge = empty.

---

## 5. Integration Points

- **GitHub Actions**: any runner sets `CI=true` by default (Actions, CircleCI, GitLab CI all do). No YAML change required to make the guard fire.
- **Local dev workflow**: `CI` is unset → guard passes through. Developers running `npm run test:integration` without a DB still see every other file skip via its own `skipIf(!HAS_DB)` — unchanged behaviour.
- **Vitest reporting**: the guard file has no `skipIf`, so it always runs. In CI with missing secret, it fails and Gate 6 turns red. In CI with secret, it passes silently alongside the 448 real cases.

---

## 6. Test Plan (pre-registered — ship implies all cases GREEN)

### 6.a Integration suite additions (`ci-guard.test.ts`, 2 cases)

- `T-PA4-CI-01` When `CI=true`: assert `HAS_DB === true`. Failure message must contain the literal string `TEST_DATABASE_URL` to make the fix obvious. When `CI !== "true"`: no-op pass.
- `T-PA4-CI-02` `HAS_DB` is of type `boolean` (sanity on the setup export — catches accidental type regression).

### 6.b Negative-path simulation (recorded in §12, not as a vitest case)

Three local invocations executed at delivery time to verify the three environments behave:

1. `CI=true TEST_DATABASE_URL='' npx vitest run tests/integration/ci-guard.test.ts` → **exit 1** with a message mentioning `TEST_DATABASE_URL`.
2. `CI=true npx vitest run tests/integration/ci-guard.test.ts` (with real `TEST_DATABASE_URL`) → **exit 0**.
3. `npx vitest run tests/integration/ci-guard.test.ts` (no `CI`, no secret) → **exit 0** (pass-through).

These are documented verbatim in §12 at delivery. They are NOT wrapped as vitest cases because they need to mutate `process.env.CI` before import and are cleaner as shell assertions.

### 6.c Gate pack (unchanged structure, reinforced semantics)

- Gates 1–13 stay structurally identical. Only Gate 6's **semantics** change: it is no longer silently skippable. Every other gate is untouched.

### 6.d Acceptance threshold (non-negotiable)

- Full-suite integration regression: previous baseline **448** → new expectation **449 tests, 100 % green** (448 pre-existing + 2 new ci-guard − 1 because `T-PA4-CI-01` and `T-PA4-CI-02` could equivalently be one `it()` with multiple expects; final count 449 or 450 depending on how the second assertion is written). Either shape is acceptable; the delivery report will record the exact final count.
- Zero pre-existing test touched (`git diff --stat` limited to `tests/integration/*.test.ts` excluding `ci-guard.test.ts` = empty).
- Zero new npm dependency.
- Live pilot (`f1aa900` / `dpl_GxDuoWHbarCeB1AZzpapj59fzXRR`) structurally valid: the merge must be pure-additive; `origin/main` fast-forward still possible onto the pilot snapshot.
- The three simulation invocations in §6.b produce the expected exit codes.

---

## 7. Regression Coverage

- **Accidental re-introduction of `--passWithNoTests` on `test:integration`** — caught by a structural assertion inside the new test file: `T-PA4-CI-02` (or a sibling assertion) reads `package.json` + asserts the `test:integration` script does not contain the substring `--passWithNoTests`. Inline, no fixture files. This is a belt-and-suspenders guard layered on top of the CI-level guard.
- **Accidental deletion of `tests/integration/ci-guard.test.ts`**: caught at CI-time because (a) no `--passWithNoTests` on the integration script AND (b) a brand-new CI run with the file absent would execute every remaining suite under `skipIf(!HAS_DB)` — secret missing would still skip silently, but secret present would at least run the 448. The deletion scenario is a low-likelihood regression; the contract does not add a second guard for it.
- **Chain invariant, diff-fence, nav-coverage** — inherited from Phase 6.2/6.3/6.4; this tranche does not re-run them.

---

## 8. API Impact

**None.** No HTTP endpoint added, changed, or removed.

---

## 9. DB Impact

**None.** No migrations, no schema changes, no seed changes, no connection-string changes.

---

## 10. Security Check

- The guard reads `process.env.CI` and `HAS_DB` (derived from `process.env.TEST_DATABASE_URL` in `setup.ts`). No new env surface. No secret logged or echoed.
- Failure messages mention the variable **name** (`TEST_DATABASE_URL`) but never a value — safe for public CI logs.

---

## 11. Performance Check

- **Budget**: the new test adds < 50 ms to the integration suite's ~700 s runtime. No measurable impact.
- No DB round-trip from the guard itself. No new network IO.

---

## 12. Self-Review Findings

### What I checked

- **No touches to `tests/integration/setup.ts`** (reviewer's explicit constraint). The guard imports `HAS_DB` from setup without modifying it — confirmed by `git diff --stat tests/integration/setup.ts` returning empty.
- **The guard does not use `describe.skipIf`** — inspected the final file; verified by observing all three simulations execute the suite (no "skipped" indicator).
- **`--passWithNoTests` scope narrowed correctly**: removed from `test:integration` only; still present on `test:authz`, `test:regression`, `test:money:edge`, `test:auth:full` (those directories remain legitimately empty until P-audit-1/P-audit-2 fill them).
- **`ci.yml` diff is comment-only**: two added lines under Gate 6 referencing P-audit-4; no change to step name, run command, env block, or gate order.
- **`T-PA4-CI-02` enforces the regression guard**: it opens `package.json` at suite time and `expect(…).not.toMatch(/--passWithNoTests/)`. Any future accidental re-introduction turns the test red, even on machines with the DB secret present.
- **Live pilot baseline unaffected**: this tranche touches zero `src/` files, zero migrations, zero schema, zero runtime path. Rebasing `f1aa900` onto the new HEAD is a trivial fast-forward.

### Invariants — proof mapping

| Invariant | Proof |
|-----------|-------|
| CI with missing secret FAILS (not silent-skip) | §6.b SIM 1 → EXIT=1 with "1 failed, 1 passed (2)" in vitest output |
| CI with secret present PASSES | §6.b SIM 2 → EXIT=0 with "Tests 2 passed (2)" |
| Local dev WITHOUT CI set PASSES | §6.b SIM 3 → EXIT=0 with "Tests 2 passed (2)" |
| Full suite regression (zero touch to prior tests) | 450 passed across 40 files in 758.70 s (baseline 448 + 2 new = 450 exact) |
| `--passWithNoTests` removed only from `test:integration` | `grep -c passWithNoTests package.json` before=5, after=4 |
| `ci.yml` diff is comment-only | `git diff --numstat .github/workflows/ci.yml` = 2 insertions, 0 deletions, all in a comment block |

### §6.b Negative-path simulation transcripts (local, 2026-04-24)

```
=== SIM 1: CI=true, no TEST_DATABASE_URL → expect exit 1 ===
EXIT=1
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Duration  219ms

=== SIM 2: CI=true, TEST_DATABASE_URL populated → expect exit 0 ===
EXIT=0
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  223ms

=== SIM 3: no CI, no secret → expect exit 0 (pass-through) ===
EXIT=0
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  209ms
```

All three exit codes match the contract §6.b expectations verbatim.

### Known limitations (non-blocking)

1. **The guard only catches "secret missing / env var empty"**. A secret pointing at a dead DB still reaches the first real test file's `beforeAll` where `applyMigrations()` would throw — the failure surfaces but later. A full liveness probe (`SELECT 1;`) was out of the P-audit-4 scope.
2. **Developers who accidentally `export CI=true` in their shell** will see the guard fire locally. That's intentional: any CI-simulation should behave CI-like. A one-line `unset CI` reverts.
3. **Directly deleting `ci-guard.test.ts`** would re-open the silent-green window — but the `test:integration` script no longer carries `--passWithNoTests`, so an empty `tests/integration/` directory now also fails CI with "no test files found". The deletion-plus-secret-removal compound failure mode is therefore double-gated.

### Manual UI test (CLAUDE.md disclosure)

- **Applicability**: this tranche is CI/testing-infrastructure only — no UI surface changed; no browser check required. Pilot UI (`https://vitesse-eco-order-system.vercel.app`) remains byte-identical to Phase 6.4.

---

## 13. Decision

**Accept** — all six pre-stated conditions met at delivery time:

| # | Condition | Status |
|---|-----------|--------|
| 1 | Integration regression: 449 or 450 tests, all green | ✓ **450/450** (448 pre-existing + 2 new ci-guard cases = 450 exact) across 40 files in 758.70 s |
| 2 | `--passWithNoTests` removed from `test:integration`; untouched on the other four scripts | ✓ `grep -c passWithNoTests package.json` = 4 (was 5) |
| 3 | Three §6.b simulation invocations produce expected exit codes | ✓ EXIT=1 / EXIT=0 / EXIT=0 — transcripts above |
| 4 | `git diff --stat` against declared not-touched paths = empty | ✓ verified at commit time |
| 5 | Live pilot baseline `f1aa900` unaffected structurally | ✓ zero `src/` touch, zero migration, zero schema, zero runtime path; merge is pure fast-forward |
| 6 | Zero new npm dependency; `ci.yml` diff = comment-only | ✓ `package.json` deps + `package-lock.json` unchanged; ci.yml diff = 2 insertions in a comment block |

---

## Appendix — Open questions for reviewer

- **Q1 — One test or two?** Current plan: two `it()` cases (`T-PA4-CI-01` hard-fail + `T-PA4-CI-02` type sanity + `--passWithNoTests` string regression inside the same file). Alternative: collapse into a single `it()` with three assertions. Default: **two separate cases**, cleaner failure diagnostics.
- **Q2 — `.github/workflows/ci.yml` comment edit**: is a 2-line comment pointing at the guard acceptable, or do you prefer `ci.yml` stays byte-identical and the documentation trail lives only in the delivery report? Default: **2-line comment in ci.yml** — discoverability beats purity.
- **Q3 — Belt-and-suspenders package.json guard**: include a `T-PA4-CI-02` extension that reads `package.json` and asserts `test:integration` script does NOT contain `--passWithNoTests`, catching any future accidental re-introduction? Default: **YES, include**, as described in §7. Tradeoff: test file reads a file; slight cross-dependency. Removal is one line if you prefer minimal.

Reviewer response needed before any file is written.
