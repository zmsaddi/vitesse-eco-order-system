#!/usr/bin/env node
// Placeholder script for CI gates that are deferred until a future phase.
// Per D-78, CI gates are "blocking" but Phase 0 foundations have no
// corresponding tests yet (no business flows, no UI, no endpoints beyond /health).
// Message map is internal to avoid Windows shell quoting issues.

const GATE_MESSAGES = {
  "test:e2e:smoke":
    "E2E smoke (Playwright) — not yet installed; activated in Phase 1+ with first golden path.",
  "test:perf":
    "Performance smoke — activated with /api/v1/* endpoints in Phase 3+ (p95 budget checks).",
  "test:a11y":
    "axe-core accessibility smoke — activated with UI flows in Phase 1+.",
  "test:logs":
    "Logging/metrics smoke — activated with Sentry integration in Phase 5+.",
  "test:responsive":
    "Responsive breakpoints tests — activated with UI in Phase 1+.",
  "test:keyboard":
    "Keyboard navigation tests — activated with UI in Phase 1+.",
  "test:voice:accuracy":
    "Voice parser accuracy — activated in Phase 5 with real sample set.",
  "test:perf:compare-baseline":
    "Perf baseline comparison — activated with endpoints in Phase 3+.",
  "db:migrate:round-trip":
    "Migration up/down verification — activated when CI has TEST_DATABASE_URL in Phase 1+.",
  "openapi:drift":
    "OpenAPI drift check — activated with first /api/v1/ business handler in Phase 1+.",
  "openapi:diff":
    "OpenAPI diff vs previous release — activated with OpenAPI generator in Phase 1+.",
};

const gate = process.env.npm_lifecycle_event ?? "(unknown)";
const msg = GATE_MESSAGES[gate] ?? "Placeholder gate — deferred to a later phase.";

process.stdout.write(
  `\n  \u001b[33m⏸  DEFERRED GATE\u001b[0m  [${gate}]\n` +
    `  ${msg}\n` +
    `  Exits 0 so CI stays green; not a real test pass.\n` +
    `  Replace this script with a real test runner command when activating.\n\n`,
);
process.exit(0);
