import { boolean, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Table 8: clients (soft-delete via deleted_at — D-04)
// D-20 + 02_DB_Tree.md + 30_Data_Integrity.md: partial unique indexes on
// (name, phone) and (name, email) — only applied where the contact field is
// non-empty AND the row isn't soft-deleted.
export const clients = pgTable(
  "clients",
  {
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
  },
  (t) => [
    uniqueIndex("clients_name_phone_active_unique")
      .on(t.name, t.phone)
      .where(sql`${t.phone} <> '' AND ${t.deletedAt} IS NULL`),
    uniqueIndex("clients_name_email_active_unique")
      .on(t.name, t.email)
      .where(sql`${t.email} <> '' AND ${t.deletedAt} IS NULL`),
  ],
);

// Table 6: suppliers (soft-disable via active — D-76 replaces DELETE endpoint)
// credit_due_from_supplier renamed via D-62.
// 02_DB_Tree.md + 36_Performance.md: partial unique on (name, phone) where
// phone is non-empty and row isn't soft-deleted — prevents alias credit splits.
export const suppliers = pgTable(
  "suppliers",
  {
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
  },
  (t) => [
    uniqueIndex("suppliers_name_phone_active_unique")
      .on(t.name, t.phone)
      .where(sql`${t.phone} <> '' AND ${t.deletedAt} IS NULL`),
  ],
);

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
