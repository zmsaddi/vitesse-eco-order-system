import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { canonicalJSON } from "@/lib/hash-chain";

// Phase 4.1.2 — hash-chain verifiers for `invoices` + `invoice_lines`.
//
// Contract (Phase 4.1.2): these verifiers MUST reconstruct each row's
// canonical input from ONLY the row itself + its frozen siblings
// (invoice_lines for the invoice chain). NO live reads of `settings`,
// `payments`, `clients`, or `products`. That's the whole point of
// frozen-only anti-fraude: the verifier proves that at a later moment
// the row still matches what `issueInvoiceInTx` committed.
//
// Both functions return the id of the FIRST corrupt row encountered
// walking ORDER BY id ASC, or `null` if the chain is intact.

// ---------- shared helpers ----------

function sha256Hex(prev: string | null, canonical: string): string {
  return crypto
    .createHash("sha256")
    .update((prev ?? "") + "|" + canonical, "utf8")
    .digest("hex");
}

// ---------- invoices chain ----------

type InvoiceRow = {
  id: number;
  ref_code: string;
  date: string;
  delivery_date: string | null;
  order_id: number;
  delivery_id: number;
  avoir_of_id: number | null;
  client_name_frozen: string;
  client_phone_frozen: string | null;
  client_email_frozen: string | null;
  client_address_frozen: string | null;
  payment_method: string;
  seller_name_frozen: string | null;
  driver_name_frozen: string | null;
  total_ttc_frozen: string;
  total_ht_frozen: string;
  tva_amount_frozen: string;
  vat_rate_frozen: string;
  status: string;
  vendor_snapshot: unknown;
  payments_history: unknown;
  prev_hash: string | null;
  row_hash: string;
};

type InvoiceLineFrozenRow = {
  invoice_id: number;
  line_number: number;
  product_name_frozen: string;
  quantity: string;
  unit_price_ttc_frozen: string;
  line_total_ttc_frozen: string;
  vat_rate_frozen: string;
  vat_amount_frozen: string;
  ht_amount_frozen: string;
  is_gift: boolean;
  vin_frozen: string | null;
};

async function readLinesFrozenForInvoice(
  tx: DbTx,
  invoiceId: number,
): Promise<InvoiceLineFrozenRow[]> {
  const res = await tx.execute(sql`
    SELECT invoice_id, line_number, product_name_frozen, quantity,
           unit_price_ttc_frozen, line_total_ttc_frozen, vat_rate_frozen,
           vat_amount_frozen, ht_amount_frozen, is_gift, vin_frozen
    FROM invoice_lines
    WHERE invoice_id = ${invoiceId}
    ORDER BY line_number ASC
  `);
  return (res as unknown as { rows?: InvoiceLineFrozenRow[] }).rows ?? [];
}

export async function verifyInvoicesChain(tx: DbTx): Promise<number | null> {
  const res = await tx.execute(sql`
    SELECT id, ref_code, date, delivery_date, order_id, delivery_id, avoir_of_id,
           client_name_frozen, client_phone_frozen, client_email_frozen,
           client_address_frozen, payment_method, seller_name_frozen,
           driver_name_frozen, total_ttc_frozen, total_ht_frozen,
           tva_amount_frozen, vat_rate_frozen, status,
           vendor_snapshot, payments_history, prev_hash, row_hash
    FROM invoices ORDER BY id ASC
  `);
  const rows = (res as unknown as { rows?: InvoiceRow[] }).rows ?? [];

  let expectedPrev: string | null = null;
  for (const r of rows) {
    if ((r.prev_hash ?? null) !== expectedPrev) return r.id;

    const lineRows = await readLinesFrozenForInvoice(tx, r.id);
    const linesCanonicalInput = lineRows.map((l) => ({
      htAmountFrozen: l.ht_amount_frozen,
      isGift: l.is_gift,
      lineNumber: l.line_number,
      lineTotalTtcFrozen: l.line_total_ttc_frozen,
      productNameFrozen: l.product_name_frozen,
      quantity: l.quantity,
      unitPriceTtcFrozen: l.unit_price_ttc_frozen,
      vatAmountFrozen: l.vat_amount_frozen,
      vatRateFrozen: l.vat_rate_frozen,
      vinFrozen: l.vin_frozen ?? "",
    }));

    const canonical = canonicalJSON({
      avoirOfId: r.avoir_of_id,
      clientAddress: r.client_address_frozen ?? "",
      clientEmail: r.client_email_frozen ?? "",
      clientName: r.client_name_frozen,
      clientPhone: r.client_phone_frozen ?? "",
      date: r.date,
      deliveryDate: r.delivery_date,
      deliveryId: r.delivery_id,
      driverName: r.driver_name_frozen ?? "",
      lines: linesCanonicalInput,
      orderId: r.order_id,
      paymentMethod: r.payment_method,
      paymentsHistory: r.payments_history,
      refCode: r.ref_code,
      sellerName: r.seller_name_frozen ?? "",
      status: r.status,
      totalHt: r.total_ht_frozen,
      totalTtc: r.total_ttc_frozen,
      tvaAmount: r.tva_amount_frozen,
      vatRate: r.vat_rate_frozen,
      vendorSnapshot: r.vendor_snapshot,
    });
    const expected = sha256Hex(r.prev_hash, canonical);
    if (expected !== r.row_hash) return r.id;
    expectedPrev = r.row_hash;
  }
  return null;
}

// ---------- invoice_lines chain ----------

type LineHashRow = InvoiceLineFrozenRow & {
  id: number;
  prev_hash: string | null;
  row_hash: string;
};

export async function verifyInvoiceLinesChain(tx: DbTx): Promise<number | null> {
  const res = await tx.execute(sql`
    SELECT id, invoice_id, line_number, product_name_frozen, quantity,
           unit_price_ttc_frozen, line_total_ttc_frozen, vat_rate_frozen,
           vat_amount_frozen, ht_amount_frozen, is_gift, vin_frozen,
           prev_hash, row_hash
    FROM invoice_lines ORDER BY id ASC
  `);
  const rows = (res as unknown as { rows?: LineHashRow[] }).rows ?? [];

  let expectedPrev: string | null = null;
  for (const r of rows) {
    if ((r.prev_hash ?? null) !== expectedPrev) return r.id;

    const canonical = canonicalJSON({
      htAmountFrozen: r.ht_amount_frozen,
      invoiceId: r.invoice_id,
      isGift: r.is_gift,
      lineNumber: r.line_number,
      lineTotalTtcFrozen: r.line_total_ttc_frozen,
      productNameFrozen: r.product_name_frozen,
      quantity: r.quantity,
      unitPriceTtcFrozen: r.unit_price_ttc_frozen,
      vatAmountFrozen: r.vat_amount_frozen,
      vatRateFrozen: r.vat_rate_frozen,
      vinFrozen: r.vin_frozen ?? "",
    });
    const expected = sha256Hex(r.prev_hash, canonical);
    if (expected !== r.row_hash) return r.id;
    expectedPrev = r.row_hash;
  }
  return null;
}
