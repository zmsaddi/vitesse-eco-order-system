import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { clients } from "./clients-suppliers";
import { orders } from "./orders";
import { users } from "./users";

// Table 16: deliveries
export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  refCode: text("ref_code").notNull().default(""),
  date: text("date").notNull(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  clientNameCached: text("client_name_cached").notNull(),
  clientPhoneCached: text("client_phone_cached").default(""),
  address: text("address").default(""),
  status: text("status").notNull().default("قيد الانتظار"),
  assignedDriverId: integer("assigned_driver_id").references(() => users.id, {
    onDelete: "restrict",
  }),
  assignedDriverUsernameCached: text("assigned_driver_username_cached").default(""),
  notes: text("notes").default(""),
  confirmationDate: timestamp("confirmation_date", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 17: driver_tasks
export const driverTasks = pgTable("driver_tasks", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // delivery|supplier_pickup|collection
  status: text("status").notNull().default("قيد الانتظار"),
  assignedDriverId: integer("assigned_driver_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  relatedEntityType: text("related_entity_type").notNull(), // D-21
  relatedEntityId: integer("related_entity_id").notNull(),
  amountHint: numeric("amount_hint", { precision: 19, scale: 2 }),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
