// Shared bootstrap for integration tests.
// Pattern: tests that need live Postgres read `TEST_DATABASE_URL`.
// When unset → tests SKIP (not fail) with a clear console banner.
// This matches D-78 §Exceptions — CI flips from "placeholder" to "real" when the secret is provisioned.
//
// Phase 3.0.2: auto-load `.env.local` at module-load time so `npm run test:integration`
// works end-to-end without shell-level `set -a; source .env.local`. We cannot rely on
// @next/env's `loadEnvConfig` here because vitest sets NODE_ENV=test, and Next.js's
// loader deliberately skips `.env.local` in test mode (it loads `.env.test.local`
// instead per Next convention). A minimal manual parser is enough: it populates
// process.env only for keys that aren't already set (so CI secrets still win).

import fs from "node:fs";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

function loadDotenvLocal(): void {
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
