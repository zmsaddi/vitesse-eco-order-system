import { z } from "zod";
import { isTwoDecimalPrecise } from "@/lib/money";

// Phase 4.1 — invoice DTOs.
//
// Every persisted column is frozen at issue time (D-30 anti-fraude): totals,
// VAT rate, client/seller/driver names, line snapshots, etc. Nothing in this
// DTO is ever recomputed from live tables after issue.
//
// Phase 4.1.1 — two JSONB columns carry the rest of the frozen inputs the PDF
// renderer needs (vendor legal block + payment history at issue time). The PDF
// reads ONLY from the invoice row + invoice_lines — no live settings, no live
// payments query at render time.

export const VendorSnapshot = z.object({
  shopName: z.string().default(""),
  shopLegalForm: z.string().default(""),
  shopSiret: z.string().default(""),
  shopSiren: z.string().default(""),
  shopApe: z.string().default(""),
  shopVatNumber: z.string().default(""),
  shopAddress: z.string().default(""),
  shopCity: z.string().default(""),
  shopEmail: z.string().default(""),
  shopWebsite: z.string().default(""),
  shopIban: z.string().default(""),
  shopBic: z.string().default(""),
  shopCapitalSocial: z.string().default(""),
  shopRcsCity: z.string().default(""),
  shopRcsNumber: z.string().default(""),
  shopPenaltyRateAnnual: z.string().default(""),
  shopRecoveryFeeEur: z.string().default(""),
});
export type VendorSnapshot = z.infer<typeof VendorSnapshot>;

export const PaymentHistoryEntry = z.object({
  date: z.string(), // YYYY-MM-DD
  amount: z.string(), // numeric(19,2)
  paymentMethod: z.string(),
  type: z.string(), // collection | advance | refund
});
export type PaymentHistoryEntry = z.infer<typeof PaymentHistoryEntry>;

export const PaymentsHistory = z.array(PaymentHistoryEntry);
export type PaymentsHistory = z.infer<typeof PaymentsHistory>;

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
  vendorSnapshot: VendorSnapshot,
  paymentsHistory: PaymentsHistory,
});
export type InvoiceDto = z.infer<typeof InvoiceDto>;

// Phase 4.5 — Avoir parent reference.
//
// An avoir (credit note) always points to a parent invoice via
// `invoices.avoir_of_id`. The PDF renders "AVOIR" with a reference line
// "Avoir de la facture <parentRefCode> du <parentDate>". That reference is
// transported as an independent DTO field (NOT folded into `VendorSnapshot`,
// which is a strict Zod schema for the frozen vendor block and would strip
// or reject a non-vendor field). Populated in `getInvoiceById` via a
// self-join on `invoices.avoir_of_id`. `null` for regular (non-avoir)
// invoices.
export const AvoirParent = z.object({
  refCode: z.string(),
  date: z.string(),
});
export type AvoirParent = z.infer<typeof AvoirParent>;

// Full projection returned by GET /api/v1/invoices/[id]: header + lines + avoirParent.
export const InvoiceDetailDto = z.object({
  invoice: InvoiceDto,
  lines: z.array(InvoiceLineDto),
  avoirParent: AvoirParent.nullable(),
});
export type InvoiceDetailDto = z.infer<typeof InvoiceDetailDto>;

// Phase 4.5 — POST /api/v1/invoices/[id]/avoir body.
//
// Full avoir: caller passes every parent line at its full quantity.
// Partial avoir: caller passes a subset of lines with reduced quantities.
// Multiple partial avoirs allowed in sequence; the service locks the parent
// + existing children and rejects when cumulative refund would exceed the
// original quantity on any line (AVOIR_QTY_EXCEEDS_REMAINING).
export const IssueAvoirLineInput = z.object({
  invoiceLineId: z.number().int().positive(),
  quantityToCredit: z
    .number()
    .positive()
    .max(1_000_000)
    .refine(isTwoDecimalPrecise, {
      message: "الكمية يجب أن تكون بدقة سنتين (2 decimals max).",
    }),
});
export type IssueAvoirLineInput = z.infer<typeof IssueAvoirLineInput>;

export const IssueAvoirInput = z.object({
  reason: z.string().min(1, "السبب إلزامي").max(2048),
  lines: z.array(IssueAvoirLineInput).min(1, "يجب تحديد سطر واحد على الأقل"),
});
export type IssueAvoirInput = z.infer<typeof IssueAvoirInput>;

export const IssueAvoirResult = z.object({
  avoir: InvoiceDto,
  lines: z.array(InvoiceLineDto),
  parentInvoiceId: z.number().int().positive(),
  parentRefCode: z.string(),
});
export type IssueAvoirResult = z.infer<typeof IssueAvoirResult>;

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
