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

// Table 3: products (soft-disable via `active` — H6; never hard-deleted)
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category").notNull().default(""),
  unit: text("unit").default(""),
  buyPrice: numeric("buy_price", { precision: 19, scale: 2 }).notNull().default("0"),
  sellPrice: numeric("sell_price", { precision: 19, scale: 2 }).notNull().default("0"),
  stock: numeric("stock", { precision: 19, scale: 2 }).notNull().default("0"),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
  active: boolean("active").notNull().default(true),
  descriptionAr: text("description_ar").default(""),
  descriptionLong: text("description_long").default(""),
  specs: jsonb("specs").default({}),
  catalogVisible: boolean("catalog_visible").notNull().default(true),
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// Table 4: product_images (D-27 RESTRICT + D-60 deterministic Blob keys)
export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  url: text("url").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 5: product_commission_rules — per-category commission rates
export const productCommissionRules = pgTable("product_commission_rules", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(),
  sellerFixedPerUnit: numeric("seller_fixed_per_unit", { precision: 19, scale: 2 }),
  sellerPctOverage: numeric("seller_pct_overage", { precision: 5, scale: 2 }),
  driverFixedPerDelivery: numeric("driver_fixed_per_delivery", { precision: 19, scale: 2 }),
  active: boolean("active").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// Table 11: gift_pool — inventory earmarked for gifting
export const giftPool = pgTable("gift_pool", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 19, scale: 2 }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 33: inventory_counts
export const inventoryCounts = pgTable("inventory_counts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  countedBy: text("counted_by").notNull(),
  countDate: text("count_date").notNull(), // DATE (stored as ISO yyyy-mm-dd)
  expectedQuantity: numeric("expected_quantity", { precision: 19, scale: 2 }).notNull(),
  actualQuantity: numeric("actual_quantity", { precision: 19, scale: 2 }).notNull(),
  variance: numeric("variance", { precision: 19, scale: 2 }).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 14: price_history (immutable — D-58 trigger)
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  productName: text("product_name").notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "restrict" }),
  purchaseId: integer("purchase_id"),
  oldBuyPrice: numeric("old_buy_price", { precision: 19, scale: 2 }).notNull().default("0"),
  newBuyPrice: numeric("new_buy_price", { precision: 19, scale: 2 }).notNull().default("0"),
  oldSellPrice: numeric("old_sell_price", { precision: 19, scale: 2 }).notNull().default("0"),
  newSellPrice: numeric("new_sell_price", { precision: 19, scale: 2 }).notNull().default("0"),
  changedBy: text("changed_by").notNull(),
});
