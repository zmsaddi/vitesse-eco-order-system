import type { invoices, invoiceLines } from "@/db/schema";
import {
  PaymentsHistory,
  VendorSnapshot,
  type InvoiceDto,
  type InvoiceLineDto,
} from "./dto";

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceLineRow = typeof invoiceLines.$inferSelect;

export function invoiceRowToDto(row: InvoiceRow): InvoiceDto {
  // JSONB columns come back as `unknown` via drizzle; parse via Zod so we
  // get safe defaults (empty vendor snapshot / empty payments array) rather
  // than letting NULL/missing values leak into PDF rendering.
  const vendor = VendorSnapshot.parse(row.vendorSnapshot ?? {});
  const payments = PaymentsHistory.parse(row.paymentsHistory ?? []);
  return {
    id: row.id,
    refCode: row.refCode,
    date: row.date,
    deliveryDate: row.deliveryDate,
    orderId: row.orderId,
    deliveryId: row.deliveryId,
    avoirOfId: row.avoirOfId,
    clientNameFrozen: row.clientNameFrozen,
    clientPhoneFrozen: row.clientPhoneFrozen ?? "",
    clientEmailFrozen: row.clientEmailFrozen ?? "",
    clientAddressFrozen: row.clientAddressFrozen ?? "",
    paymentMethod: row.paymentMethod,
    sellerNameFrozen: row.sellerNameFrozen ?? "",
    driverNameFrozen: row.driverNameFrozen ?? "",
    totalTtcFrozen: row.totalTtcFrozen,
    totalHtFrozen: row.totalHtFrozen,
    tvaAmountFrozen: row.tvaAmountFrozen,
    vatRateFrozen: row.vatRateFrozen,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    vendorSnapshot: vendor,
    paymentsHistory: payments,
  };
}

export function invoiceLineRowToDto(row: InvoiceLineRow): InvoiceLineDto {
  return {
    id: row.id,
    lineNumber: row.lineNumber,
    productNameFrozen: row.productNameFrozen,
    quantity: row.quantity,
    unitPriceTtcFrozen: row.unitPriceTtcFrozen,
    lineTotalTtcFrozen: row.lineTotalTtcFrozen,
    vatRateFrozen: row.vatRateFrozen,
    vatAmountFrozen: row.vatAmountFrozen,
    htAmountFrozen: row.htAmountFrozen,
    isGift: row.isGift,
    vinFrozen: row.vinFrozen ?? "",
  };
}
