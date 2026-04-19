import { integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { deliveries } from "./delivery";
import { orders, orderItems } from "./orders";
import { users } from "./users";

// Table 20: bonuses (D-29 — order_item_id NULLABLE + split UNIQUE per role)
export const bonuses = pgTable(
  "bonuses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    username: text("username").notNull(),
    role: text("role").notNull(), // seller | driver
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: integer("order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }), // D-29: NULLABLE (driver bonus is per-delivery, not per-item)
    deliveryId: integer("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "restrict" }),
    date: text("date").notNull(),
    fixedPart: numeric("fixed_part", { precision: 19, scale: 2 }).notNull().default("0"),
    overagePart: numeric("overage_part", { precision: 19, scale: 2 }).notNull().default("0"),
    totalBonus: numeric("total_bonus", { precision: 19, scale: 2 }).notNull(),
    settlementId: integer("settlement_id"),
    status: text("status").notNull().default("unpaid"), // unpaid|settled|retained
    notes: text("notes").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // D-29: seller — UNIQUE per (delivery, order_item, role)
    uniqueIndex("bonuses_seller_unique")
      .on(t.deliveryId, t.orderItemId, t.role)
      .where(sql`${t.role} = 'seller' AND ${t.deletedAt} IS NULL`),
    // D-29: driver — UNIQUE per (delivery, role)
    uniqueIndex("bonuses_driver_unique")
      .on(t.deliveryId, t.role)
      .where(sql`${t.role} = 'driver' AND ${t.deletedAt} IS NULL`),
  ],
);

// Table 22: settlements (bonus payouts + rewards)
export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  username: text("username").notNull(),
  role: text("role").notNull(),
  type: text("type").notNull(), // settlement | reward | debt
  amount: numeric("amount", { precision: 19, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("كاش"),
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Table 23: profit_distribution_groups (D-54 non-overlapping periods enforced in service)
export const profitDistributionGroups = pgTable("profit_distribution_groups", {
  id: text("id").primaryKey(), // UUID
  basePeriodStart: text("base_period_start").notNull(),
  basePeriodEnd: text("base_period_end").notNull(),
  netProfit: numeric("net_profit", { precision: 19, scale: 2 }).notNull(),
  distributable: numeric("distributable", { precision: 19, scale: 2 }).notNull(),
  distributed: numeric("distributed", { precision: 19, scale: 2 }).notNull().default("0"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Table 24: profit_distributions (per-recipient)
export const profitDistributions = pgTable("profit_distributions", {
  id: serial("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => profitDistributionGroups.id, { onDelete: "restrict" }), // D-27
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  username: text("username").notNull(),
  baseAmount: numeric("base_amount", { precision: 19, scale: 2 }).notNull(),
  percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 19, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
