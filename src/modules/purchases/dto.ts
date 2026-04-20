import { z } from "zod";

// Phase 3.0 purchases — weighted-avg on add + structured reverse on correction.
// No DELETE anywhere (D-04 + 35_API_Endpoints).

export const PurchaseDto = z.object({
  id: z.number().int().positive(),
  refCode: z.string().default(""),
  date: z.string(),
  supplierId: z.number().int().positive(),
  supplierNameCached: z.string(),
  productId: z.number().int().positive(),
  itemNameCached: z.string(),
  category: z.string().default(""),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  paymentMethod: z.string(),
  paidAmount: z.number(),
  paymentStatus: z.string(),
  notes: z.string().default(""),
  createdBy: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
export type PurchaseDto = z.infer<typeof PurchaseDto>;

export const CreatePurchaseInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierId: z.number().int().positive(),
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  paymentMethod: z.enum(["كاش", "بنك", "آجل"]).default("كاش"),
  paidAmount: z.number().min(0).default(0),
  notes: z.string().max(2048).default(""),
});
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseInput>;

// Reverse input — which settlement path to use for the supplier balance.
//   'refund_cash'     → full amount refunded back to the shop cash (no supplier credit change).
//   'supplier_credit' → supplier now owes us (credit_due_from_supplier += total).
export const ReversePurchaseInput = z.object({
  reason: z.string().min(1).max(1024),
  reversalPath: z.enum(["refund_cash", "supplier_credit"]),
});
export type ReversePurchaseInput = z.infer<typeof ReversePurchaseInput>;
