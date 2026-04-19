import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// Table 25: treasury_accounts (hierarchical — GM cash/bank → manager_box → driver_custody)
export const treasuryAccounts = pgTable("treasury_accounts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // main_cash | main_bank | manager_box | driver_custody
  name: text("name").notNull(),
  ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
  parentAccountId: integer("parent_account_id"), // self-ref SET NULL on parent delete
  balance: numeric("balance", { precision: 19, scale: 2 }).notNull().default("0"),
  active: integer("active").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Table 26: treasury_movements (immutable — D-58 trigger; D-10 no supplier_credit category)
export const treasuryMovements = pgTable("treasury_movements", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  category: text("category").notNull(), // sale_collection|supplier_payment|expense|settlement|...
  fromAccountId: integer("from_account_id").references(() => treasuryAccounts.id, {
    onDelete: "restrict",
  }),
  toAccountId: integer("to_account_id").references(() => treasuryAccounts.id, {
    onDelete: "restrict",
  }),
  amount: numeric("amount", { precision: 19, scale: 2 }).notNull(), // signed
  referenceType: text("reference_type"), // order | purchase | expense | settlement | ...
  referenceId: integer("reference_id"),
  notes: text("notes").default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
