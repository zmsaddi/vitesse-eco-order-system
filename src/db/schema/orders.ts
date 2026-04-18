import { pgTable, serial, text, numeric, boolean, integer, date, timestamp } from 'drizzle-orm/pg-core'

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  refCode: text('ref_code').notNull(),
  date: date('date').notNull(),
  clientName: text('client_name').notNull(),
  clientPhone: text('client_phone').default(''),
  status: text('status').default('محجوز'),
  paymentMethod: text('payment_method').notNull(),
  totalAmount: numeric('total_amount', { precision: 19, scale: 2 }).default('0'),
  paidAmount: numeric('paid_amount', { precision: 19, scale: 2 }).default('0'),
  remaining: numeric('remaining', { precision: 19, scale: 2 }).default('0'),
  paymentStatus: text('payment_status').default('pending'),
  downPayment: numeric('down_payment', { precision: 19, scale: 2 }).default('0'),
  cancelReason: text('cancel_reason'),
  notes: text('notes').default(''),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productName: text('product_name').notNull(),
  category: text('category').default(''),
  quantity: numeric('quantity', { precision: 19, scale: 2 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 19, scale: 2 }).notNull(),
  costPrice: numeric('cost_price', { precision: 19, scale: 2 }).default('0'),
  lineTotal: numeric('line_total', { precision: 19, scale: 2 }).notNull(),
  discountType: text('discount_type'),
  discountValue: numeric('discount_value', { precision: 19, scale: 2 }).default('0'),
  discountReason: text('discount_reason').default(''),
  isGift: boolean('is_gift').default(false),
  giftApprovedBy: text('gift_approved_by'),
  vin: text('vin').default(''),
  commissionAmount: numeric('commission_amount', { precision: 19, scale: 2 }).default('0'),
})

export const giftPool = pgTable('gift_pool', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull(),
  maxQuantity: integer('max_quantity').notNull(),
  remainingQuantity: integer('remaining_quantity').notNull(),
  enabled: boolean('enabled').default(true),
  setBy: text('set_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
