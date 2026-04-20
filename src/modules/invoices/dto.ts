import { z } from "zod";

// Phase 4.1 — invoice DTOs.
//
// Every persisted column is frozen at issue time (D-30 anti-fraude): totals,
// VAT rate, client/seller/driver names, line snapshots, etc. Nothing in this
// DTO is ever recomputed from live tables after issue.

export const InvoiceLineDto = z.object({
  id: z.number().int().positive(),
  lineNumber: z.number().int().positive(),
  productNameFrozen: z.string(),
  quantity: z.string(), // numeric(19,2)
  unitPriceTtcFrozen: z.string(),
  lineTotalTtcFrozen: z.string(),
  vatRateFrozen: z.string(),
  vatAmountFrozen: z.string(),
  htAmountFrozen: z.string(),
  isGift: z.boolean(),
  vinFrozen: z.string().default(""),
});
export type InvoiceLineDto = z.infer<typeof InvoiceLineDto>;

export const InvoiceDto = z.object({
  id: z.number().int().positive(),
  refCode: z.string(),
  date: z.string(),
  deliveryDate: z.string().nullable(),
  orderId: z.number().int().positive(),
  deliveryId: z.number().int().positive(),
  avoirOfId: z.number().int().positive().nullable(),
  clientNameFrozen: z.string(),
  clientPhoneFrozen: z.string().default(""),
  clientEmailFrozen: z.string().default(""),
  clientAddressFrozen: z.string().default(""),
  paymentMethod: z.string(),
  sellerNameFrozen: z.string().default(""),
  driverNameFrozen: z.string().default(""),
  totalTtcFrozen: z.string(),
  totalHtFrozen: z.string(),
  tvaAmountFrozen: z.string(),
  vatRateFrozen: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type InvoiceDto = z.infer<typeof InvoiceDto>;

// Full projection returned by GET /api/v1/invoices/[id]: header + lines.
export const InvoiceDetailDto = z.object({
  invoice: InvoiceDto,
  lines: z.array(InvoiceLineDto),
});
export type InvoiceDetailDto = z.infer<typeof InvoiceDetailDto>;

// List query — pagination + date-range filter + status filter.
export const ListInvoicesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["مؤكد", "ملغي"]).optional(),
});
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuery>;
