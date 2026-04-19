import { check, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { VOICE_LOG_STATUSES } from "./enums";

// Table 34: voice_logs (D-63 status enum check)
export const voiceLogs = pgTable(
  "voice_logs",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    username: text("username").notNull(),
    transcript: text("transcript").default(""),
    normalizedText: text("normalized_text").default(""),
    actionType: text("action_type").default(""),
    actionId: integer("action_id"),
    status: text("status").notNull().default("pending"),
    debugJson: jsonb("debug_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "voice_logs_status_check",
      sql`${t.status} IN (${sql.raw(VOICE_LOG_STATUSES.map((s) => `'${s}'`).join(", "))})`,
    ),
  ],
);

// Table 35: entity_aliases (learned aliases from voice corrections)
export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // product | client | supplier
    entityId: integer("entity_id").notNull(),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: text("source").notNull().default("user"), // user | seed
    frequency: integer("frequency").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("entity_aliases_type_norm_unique").on(t.entityType, t.normalizedAlias)],
);

// Table 36a: ai_corrections (raw user edits — feeds ai_patterns)
export const aiCorrections = pgTable("ai_corrections", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  username: text("username").notNull(),
  transcript: text("transcript").notNull(),
  aiOutput: text("ai_output").notNull(),
  userCorrection: text("user_correction").notNull(),
  actionType: text("action_type").notNull(),
  fieldName: text("field_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 36b: ai_patterns (aggregated patterns with frequency for reinforcement)
export const aiPatterns = pgTable(
  "ai_patterns",
  {
    id: serial("id").primaryKey(),
    patternType: text("pattern_type").notNull(),
    spokenText: text("spoken_text").notNull(),
    correctValue: text("correct_value").notNull(),
    fieldName: text("field_name").notNull(),
    frequency: integer("frequency").notNull().default(1),
    lastUsed: timestamp("last_used", { withTimezone: true }).notNull().defaultNow(),
    username: text("username").default(""),
  },
  (t) => [unique("ai_patterns_unique").on(t.spokenText, t.correctValue, t.fieldName, t.username)],
);
