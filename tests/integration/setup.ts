// Shared bootstrap for integration tests.
// Pattern: tests that need live Postgres read `TEST_DATABASE_URL`.
// When unset → tests SKIP (not fail) with a clear console banner.
// This matches D-78 §Exceptions — CI flips from "placeholder" to "real" when the secret is provisioned.

import { Pool } from "@neondatabase/serverless";

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
