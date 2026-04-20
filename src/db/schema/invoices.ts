import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { deliveries } from "./delivery";
import { orders } from "./orders";

// Table 18: invoices (D-30 frozen snapshot + D-37 hash chain + D-38 Avoir structure)
export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    refCode: text("ref_code").notNull(), // FAC-YYYY-MM-NNNN (D-01)
    date: text("date").notNull(), // date de facturation
    deliveryDate: text("delivery_date"), // D-35 — date de livraison
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    deliveryId: integer("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "restrict" }),
    avoirOfId: integer("avoir_of_id"), // D-38 — points to original facture when this is an Avoir

    // Frozen client snapshot (D-30)
    clientNameFrozen: text("client_name_frozen").notNull(),
    clientPhoneFrozen: text("client_phone_frozen").default(""),
    clientEmailFrozen: text("client_email_frozen").default(""),
    clientAddressFrozen: text("client_address_frozen").default(""),

    paymentMethod: text("payment_method").notNull().default("كاش"),
    sellerNameFrozen: text("seller_name_frozen").default(""),
    driverNameFrozen: text("driver_name_frozen").default(""),

    // Frozen totals (D-30 — loi anti-fraude 2018)
    totalTtcFrozen: numeric("total_ttc_frozen", { precision: 19, scale: 2 }).notNull(),
    totalHtFrozen: numeric("total_ht_frozen", { precision: 19, scale: 2 }).notNull(),
    tvaAmountFrozen: numeric("tva_amount_frozen", { precision: 19, scale: 2 }).notNull(),
    vatRateFrozen: numeric("vat_rate_frozen", { precision: 5, scale: 2 }).notNull(),

    // Phase 4.1.1 — frozen vendor + payments snapshots for PDF inaltérabilité
    // (00_DECISIONS §PDF render = frozen-only). Populated at issue time from
    // settings + payments table; never read live thereafter.
    vendorSnapshot: jsonb("vendor_snapshot")
      .notNull()
      .default(sql`'{}'::jsonb`),
    paymentsHistory: jsonb("payments_history")
      .notNull()
      .default(sql`'[]'::jsonb`),

    // Hash chain (D-37)
    prevHash: text("prev_hash"),
    rowHash: text("row_hash").notNull(),

    status: text("status").notNull().default("مؤكد"),
    pdfUrl: text("pdf_url"), // set by background job (D-55)
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // D-38: Avoir must have total < 0
    check(
      "invoices_avoir_negative_check",
      sql`(${t.avoirOfId} IS NULL) OR (${t.totalTtcFrozen}::numeric < 0)`,
    ),
    unique("invoices_ref_code_unique").on(t.refCode),
  ],
);

// Table 18b: invoice_lines (D-30 — frozen line snapshot, immutable via D-58 trigger
// + D-37 per-line hash chain since Phase 4.1.2)
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    lineNumber: integer("line_number").notNull(),
    productNameFrozen: text("product_name_frozen").notNull(),
    quantity: numeric("quantity", { precision: 19, scale: 2 }).notNull(), // signed (negative for Avoir)
    unitPriceTtcFrozen: numeric("unit_price_ttc_frozen", { precision: 19, scale: 2 }).notNull(),
    lineTotalTtcFrozen: numeric("line_total_ttc_frozen", { precision: 19, scale: 2 }).notNull(),
    vatRateFrozen: numeric("vat_rate_frozen", { precision: 5, scale: 2 }).notNull(),
    vatAmountFrozen: numeric("vat_amount_frozen", { precision: 19, scale: 2 }).notNull(),
    htAmountFrozen: numeric("ht_amount_frozen", { precision: 19, scale: 2 }).notNull(),
    isGift: boolean("is_gift").notNull().default(false),
    vinFrozen: text("vin_frozen").default(""),
    // D-37 per-line hash chain (Phase 4.1.2). The empty-string default is a
    // bootstrap migration compromise: every row inserted by issueInvoiceInTx
    // carries a real sha256 hex + linked prev_hash. An integration test
    // explicitly asserts no row produced by the app has an empty row_hash.
    prevHash: text("prev_hash"),
    rowHash: text("row_hash").notNull().default(""),
  },
  (t) => [unique("invoice_lines_invoice_line_unique").on(t.invoiceId, t.lineNumber)],
);

// Table 19: invoice_sequence — monthly atomic counter (D-01)
export const invoiceSequence = pgTable(
  "invoice_sequence",
  {
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (t) => [unique("invoice_sequence_year_month_unique").on(t.year, t.month)],
);
