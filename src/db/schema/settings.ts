import { check, pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { SETTINGS_KEYS } from "./enums";

// Table 2: settings (D-28 — ENUM CHECK on `key`)
// Typed accessor in src/lib/settings.ts (Phase 2+) with Zod schema + 60s cache.
export const settings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  },
  (t) => [
    check(
      "settings_key_check",
      sql`${t.key} IN (${sql.raw(SETTINGS_KEYS.map((k) => `'${k}'`).join(", "))})`,
    ),
  ],
);
