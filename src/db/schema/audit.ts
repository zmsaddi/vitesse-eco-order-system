import { integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { orders } from "./orders";

// Table 30: activity_log (D-58 immutable + D-37 hash chain)
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  userId: integer("user_id"),
  username: text("username").notNull(),
  action: text("action").notNull(), // create|update|delete|cancel|confirm|collect|login|logout
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  entityRefCode: text("entity_ref_code"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  prevHash: text("prev_hash"), // D-37
  rowHash: text("row_hash").notNull(), // D-37
});

// Table 32: cancellations (D-58 immutable + D-37 hash chain; C1 dialog fields)
export const cancellations = pgTable("cancellations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  cancelledBy: text("cancelled_by").notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull(),
  refundAmount: numeric("refund_amount", { precision: 19, scale: 2 }).notNull().default("0"),
  returnToStock: integer("return_to_stock").notNull(), // boolean as 0/1
  sellerBonusAction: text("seller_bonus_action").notNull(), // keep|cancel_as_debt|cancel_unpaid
  driverBonusAction: text("driver_bonus_action").notNull(),
  deliveryStatusBefore: text("delivery_status_before"),
  notes: text("notes"),
  prevHash: text("prev_hash"),
  rowHash: text("row_hash").notNull(),
});

// Table 32b: idempotency_keys (D-57 PK on (key, endpoint))
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").notNull(),
    endpoint: text("endpoint").notNull(),
    username: text("username").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response").notNull(),
    statusCode: integer("status_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.endpoint] })],
);
