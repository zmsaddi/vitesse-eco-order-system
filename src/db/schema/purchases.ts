import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { products } from "./products";
import { suppliers } from "./clients-suppliers";

// Table 13: purchases
export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  refCode: text("ref_code").notNull().default(""),
  date: text("date").notNull(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "restrict" }),
  supplierNameCached: text("supplier_name_cached").notNull(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  itemNameCached: text("item_name_cached").notNull(),
  category: text("category").default(""),
  quantity: numeric("quantity", { precision: 19, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 19, scale: 2 }).notNull(),
  total: numeric("total", { precision: 19, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("كاش"),
  paidAmount: numeric("paid_amount", { precision: 19, scale: 2 }).notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("paid"),
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
});

// Table 15: expenses (D-61 PCG comptable class + D-76 no DELETE endpoint)
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 19, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("كاش"),
  comptableClass: text("comptable_class"), // D-61 (e.g. '6037', '6251')
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
