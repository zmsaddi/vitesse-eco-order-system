import { boolean, check, date, integer, numeric, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ROLES } from "./enums";

// Table 1: users (D-40 Argon2id password + D-49 onboarded_at + soft-disable via `active`)
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    password: text("password").notNull(), // Argon2id (D-40); bcrypt 14 fallback
    name: text("name").notNull(),
    role: text("role").notNull().default("seller"),
    active: boolean("active").notNull().default(true),
    profitSharePct: numeric("profit_share_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    profitShareStart: date("profit_share_start"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }), // D-49
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("users_role_check", sql`${t.role} IN (${sql.raw(ROLES.map((r) => `'${r}'`).join(", "))})`),
  ],
);

// Table 21: user_bonus_rates — per-user commission overrides
export const userBonusRates = pgTable("user_bonus_rates", {
  username: text("username")
    .primaryKey()
    .references(() => users.username, { onDelete: "restrict" }), // D-27
  sellerFixed: numeric("seller_fixed", { precision: 19, scale: 2 }),
  sellerPercentage: numeric("seller_percentage", { precision: 5, scale: 2 }),
  driverFixed: numeric("driver_fixed", { precision: 19, scale: 2 }),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// Table 31: permissions (DB-driven role matrix — D-12 + D-59)
export const permissions = pgTable(
  "permissions",
  {
    id: serial("id").primaryKey(),
    role: text("role").notNull(),
    resource: text("resource").notNull(),
    action: text("action").notNull(), // view|create|edit|delete|approve|view_all|view_own|...
    allowed: boolean("allowed").notNull().default(false),
  },
  (t) => [unique("permissions_role_resource_action_unique").on(t.role, t.resource, t.action)],
);

// Table 29: notification_preferences (in_app only — D-22)
export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }), // D-27
  notificationType: text("notification_type").notNull(),
  channel: text("channel").notNull().default("in_app"),
  enabled: boolean("enabled").notNull().default(true),
});

// Table 28: notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  clickTarget: text("click_target"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 37: voice_rate_limits (D-73 — DB-only, supersedes D-33 hybrid)
export const voiceRateLimits = pgTable("voice_rate_limits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
