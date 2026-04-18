import { pgTable, serial, text, boolean, numeric, date, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').unique().notNull(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('seller'),
  active: boolean('active').default(true),
  profitSharePct: numeric('profit_share_pct', { precision: 5, scale: 2 }).default('0'),
  profitShareStart: date('profit_share_start'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
