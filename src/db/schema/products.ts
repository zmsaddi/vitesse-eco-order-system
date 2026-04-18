import { pgTable, serial, text, boolean, numeric, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').unique().notNull(),
  category: text('category').notNull().default(''),
  unit: text('unit').default(''),
  buyPrice: numeric('buy_price', { precision: 19, scale: 2 }).default('0'),
  sellPrice: numeric('sell_price', { precision: 19, scale: 2 }).default('0'),
  stock: numeric('stock', { precision: 19, scale: 2 }).default('0'),
  lowStockThreshold: integer('low_stock_threshold').default(3),
  active: boolean('active').default(true),
  descriptionAr: text('description_ar').default(''),
  descriptionLong: text('description_long').default(''),
  specs: jsonb('specs').default({}),
  catalogVisible: boolean('catalog_visible').default(true),
  notes: text('notes').default(''),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
})

export const productImages = pgTable('product_images', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  isPrimary: boolean('is_primary').default(false),
  sortOrder: integer('sort_order').default(0),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow(),
})

export const productCommissionRules = pgTable('product_commission_rules', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  sellerFixedPerUnit: numeric('seller_fixed_per_unit', { precision: 19, scale: 2 }).default('0'),
  sellerPctOverage: numeric('seller_pct_overage', { precision: 5, scale: 2 }).default('0'),
  driverFixedPerDelivery: numeric('driver_fixed_per_delivery', { precision: 19, scale: 2 }).default('0'),
  priority: integer('priority').default(0),
  createdBy: text('created_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
})
