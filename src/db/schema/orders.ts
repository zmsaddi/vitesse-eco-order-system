import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { clients } from "./clients-suppliers";
import { products } from "./products";

// Table 9: orders (replaces v1 `sales`) — multi-item, soft-delete
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  refCode: text("ref_code").notNull().default(""), // ORD-YYYYMMDD-NNNNN
  date: text("date").notNull(), // DATE
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  clientNameCached: text("client_name_cached").notNull(), // D-20
  clientPhoneCached: text("client_phone_cached").default(""),
  status: text("status").notNull().default("محجوز"),
  paymentMethod: text("payment_method").notNull().default("كاش"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  discountType: text("discount_type"),
  discountValue: numeric("discount_value", { precision: 19, scale: 2 }),
  totalAmount: numeric("total_amount", { precision: 19, scale: 2 }).notNull().default("0"),
  advancePaid: numeric("advance_paid", { precision: 19, scale: 2 }).notNull().default("0"),
  notes: text("notes").default(""),
  deliveryDate: text("delivery_date"), // D-35 — date de livraison (filled on status='مؤكد')
  confirmationDate: timestamp("confirmation_date", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 10: order_items — D-17 commission snapshot + D-20 name caching
// Phase 3.1 additions (BR-18 + BR-41):
//  - recommendedPrice: product.sellPrice snapshot at creation time (BR-41 discount basis)
//  - discountType + discountValue: per-item discount audit trail; unitPrice is the
//    already-applied post-discount figure (per schema comment above).
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }), // D-27 (was CASCADE)
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  productNameCached: text("product_name_cached").notNull(), // D-20
  category: text("category").notNull().default(""), // snapshot من products.category
  quantity: numeric("quantity", { precision: 19, scale: 2 }).notNull(),
  recommendedPrice: numeric("recommended_price", { precision: 19, scale: 2 })
    .notNull()
    .default("0"), // BR-41 list-price basis at order creation
  unitPrice: numeric("unit_price", { precision: 19, scale: 2 }).notNull(), // TTC، بعد الخصم
  costPrice: numeric("cost_price", { precision: 19, scale: 2 }).notNull(), // snapshot buy_price (COGS — D-08)
  discountType: text("discount_type"), // 'percent' | 'fixed' | NULL
  discountValue: numeric("discount_value", { precision: 19, scale: 2 }),
  lineTotal: numeric("line_total", { precision: 19, scale: 2 }).notNull(),
  isGift: boolean("is_gift").notNull().default(false),
  vin: text("vin").default(""),
  commissionRuleSnapshot: jsonb("commission_rule_snapshot").notNull(), // D-17
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Table 12: payments (signed amounts — D-06: collection+, refund-, advance+)
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  clientNameCached: text("client_name_cached").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull().default("collection"), // collection|refund|advance
  paymentMethod: text("payment_method").notNull().default("كاش"),
  amount: numeric("amount", { precision: 19, scale: 2 }).notNull(), // signed
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
});

// Table 27: payment_schedule — for 'آجل' orders
export const paymentSchedule = pgTable("payment_schedule", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  dueDate: text("due_date").notNull(),
  amount: numeric("amount", { precision: 19, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 19, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"), // pending|paid|overdue
  notes: text("notes").default(""),
});
