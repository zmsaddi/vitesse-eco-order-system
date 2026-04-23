# CI Secrets Reference

> Phase 5.5 — documents the repo secrets required to make every CI gate in
> `.github/workflows/ci.yml` return a meaningful result. Missing a secret
> does not crash CI today (tests use `describe.skipIf(!HAS_DB)` or have
> fallbacks), but several gates degrade to pass-by-skip. Provision these to
> get real signal.

## Required (to exercise the full gate pack)

| Secret | Used by | Effect if missing |
|--------|---------|-------------------|
| `TEST_DATABASE_URL` | Gate 6 (integration), Gate 8 (migration check) | Integration suites skip the describe blocks via `HAS_DB=false`, so the gates pass trivially without exercising any DB code. |
| `NEXTAUTH_SECRET` | Gate 6 (integration) — NextAuth session signing | A hard-coded CI fallback is used (`ci-fallback-secret-at-least-32-chars-long`). That's safe for tests but not usable for anything real. Overriding is only needed if a test requires a specific signing identity; unlikely in this project. |

## Intentionally absent

| Secret | Why | Behaviour |
|--------|-----|-----------|
| `INIT_BOOTSTRAP_SECRET` | Phase 1 integration tests exercise the `/api/init` no-secret (dev) path. Setting it in CI would flip the test setup into a different branch of `init.test.ts` and break coverage. | Tests assert 200 on first init + 409 on second init with no secret. |

## Provisioning notes

- `TEST_DATABASE_URL` should point at a Neon branch (or any ephemeral Postgres) that can tolerate `DROP SCHEMA public CASCADE` + `CREATE SCHEMA public` at the start of every test file. Do **not** point it at production.
- After `0012_notification_preferences_unique.sql` (Phase 5.1a hardening) the schema is idempotent — re-running migrations over an existing schema is safe (all DDL uses `IF NOT EXISTS` or the migration is additive).
- The fresh branch pattern documented in `.env.local` (post-5.1b throttling incident) applies equally to CI: if a Neon branch hits persistent WebSocket throttling, provision a new branch and update the secret. No code change needed.

## Non-blocking jobs

- **`audit` job** (`npm audit --audit-level=moderate --production`) is `continue-on-error: true`. It surfaces known advisories as annotations but does not gate merges; security fixes go in their own PRs.
