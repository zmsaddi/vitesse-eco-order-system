// Shared bootstrap for integration tests.
// Pattern: tests that need live Postgres read `TEST_DATABASE_URL`.
// When unset → tests SKIP (not fail) with a clear console banner.
// This matches D-78 §Exceptions — CI flips from "placeholder" to "real" when the secret is provisioned.
//
// Phase 3.0.2 added auto-loading of `.env.local` so `npm run test:integration` works
// end-to-end without shell-level `set -a; source .env.local`. That broke Gate 5:
// a stray `vitest run` with the default include picks up tests/integration/**, which
// import this setup module and inherit the env load → HAS_DB=true → integration
// suites execute under test:unit's config (no hook-timeout bump, no serial runs) and
// fail.
//
// Phase 3.0.3 fix: env-loading is now opt-in — it runs ONLY when either:
//   - npm is invoking the `test:integration` script (`npm_lifecycle_event`), or
//   - the caller explicitly sets `LOAD_INTEGRATION_ENV=1` (CI flexibility).
// Combined with package.json `test:unit` script being scoped to `src/` only, the
// two gates are fully decoupled: test:unit never imports this file; test:integration
// is the only path that triggers the env load.

import fs from "node:fs";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

function shouldLoadDotenvLocal(): boolean {
  if (process.env.LOAD_INTEGRATION_ENV === "1") return true;
  if (process.env.npm_lifecycle_event === "test:integration") return true;
  return false;
}

function loadDotenvLocal(): void {
  if (!shouldLoadDotenvLocal()) return;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotenvLocal();

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
export const HAS_DB = TEST_DATABASE_URL.length > 0;

// Phase 4.1 — D-35 readiness seed. `confirmDelivery` now validates every key in
// D35_REQUIRED_SETTINGS at the top of its tx, so any integration test that
// exercises confirm-delivery must seed these settings in its beforeAll. Each
// test file composes this alongside its own operational knobs (commission,
// VAT, etc.) via `settings.onConflictDoUpdate`.
export const D35_SEED_SETTINGS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "shop_name", value: "VITESSE ECO SAS" },
  { key: "shop_legal_form", value: "SAS" },
  { key: "shop_siret", value: "12345678901234" },
  { key: "shop_siren", value: "123456789" },
  { key: "shop_ape", value: "4618Z" },
  { key: "shop_vat_number", value: "FR12345678901" },
  { key: "shop_address", value: "123 Rue de la Paix" },
  { key: "shop_city", value: "86000 Poitiers" },
  { key: "shop_capital_social", value: "10000" },
  { key: "shop_rcs_city", value: "Poitiers" },
  { key: "shop_rcs_number", value: "RCS Poitiers 123 456 789" },
  { key: "shop_iban", value: "FR7610057190010000000000001" },
  { key: "shop_bic", value: "CMBRFR2BARK" },
  { key: "shop_penalty_rate_annual", value: "10.5" },
  { key: "shop_recovery_fee_eur", value: "40" },
  { key: "vat_rate", value: "20" },
];

export async function resetSchema(): Promise<void> {
  if (!HAS_DB) return;
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
  } finally {
    await pool.end();
  }
}

/**
 * Apply migrations via raw SQL (Drizzle migrator requires specific format).
 * Phase 1a bootstrap: reads migration files and executes them in order.
 */
export async function applyMigrations(): Promise<void> {
  if (!HAS_DB) return;
  // Lazy-import so that node's fs doesn't run when skipped.
  const { readFileSync, readdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const migDir = resolve(process.cwd(), "src/db/migrations");
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    for (const file of files) {
      const sql = readFileSync(resolve(migDir, file), "utf-8");
      // Drizzle emits `--> statement-breakpoint` between statements.
      const statements = sql.split(/--> statement-breakpoint/).map((s) => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        try {
          await pool.query(stmt);
        } catch (err) {
          const msg = (err as Error).message;
          // Re-apply idempotency for "already exists"
          if (/already exists/i.test(msg)) continue;
          throw new Error(`Migration ${file} failed at statement:\n${stmt}\n\n${msg}`);
        }
      }
    }
  } finally {
    await pool.end();
  }
}
