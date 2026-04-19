# tests/ — Higher-level test tree

> **Per D-78**: unit tests live in `src/**/*.test.ts` next to the code under test.
> This tree holds **higher-level** tests that span modules or need real infrastructure.

## Subdirectories

| Path | Purpose | Activated in |
|------|---------|--------------|
| `tests/integration/` | API + DB integration (Neon ephemeral branch). CI Gate 6. | Phase 1 (Auth), expanded per phase |
| `tests/authz/` | Authorization matrix: 6 roles × resources × actions → expected allow/deny. CI Gate 9. | Phase 1 |
| `tests/regression/` | Permanent regression pack (D-78 §2): login, orders, delivery, invoice, treasury, permissions, idempotency, snapshots, soft-delete, `/api/v1/*` compat, Android-readiness. CI Gate 10. | Phase 1 starts; grows each phase |
| `tests/money/` | Money edge cases: rounding, negatives, concurrency. Scope-based (D-78 §6). | Phase 3 (bonuses + invoice totals) |
| `tests/auth/` | Session claims extraction, role checks, token/cookie behavior. Scope-based. | Phase 1 |

## How empty passes

Each of the CI-referenced scripts uses `vitest run --dir <path> --passWithNoTests` so they
exit 0 on empty directories (CI stays green). When files land, they run normally.

## Convention

- File naming: `<topic>.test.ts` (vitest pattern).
- One describe block per logical flow.
- Prefer integration fixtures that boot a real Neon branch (managed in CI by `NEON_API_KEY`).
