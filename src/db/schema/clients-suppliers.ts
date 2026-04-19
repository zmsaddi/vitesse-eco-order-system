import { boolean, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Table 8: clients (soft-delete via deleted_at — D-04)
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  latinName: text("latin_name").default(""),
  phone: text("phone").default(""),
  email: text("email").default(""),
  address: text("address").default(""),
  descriptionAr: text("description_ar").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 6: suppliers (soft-disable via active — D-76 replaces DELETE endpoint)
// credit_due_from_supplier renamed via D-62.
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").default(""),
  address: text("address").default(""),
  notes: text("notes").default(""),
  creditDueFromSupplier: numeric("credit_due_from_supplier", { precision: 19, scale: 2 })
    .notNull()
    .default("0"),
  active: boolean("active").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
});

// Table 7: supplier_payments
export const supplierPayments = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  supplierId: serial("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
  date: text("date").notNull(),
  amount: numeric("amount", { precision: 19, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("كاش"),
  purchaseId: serial("purchase_id"),
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
