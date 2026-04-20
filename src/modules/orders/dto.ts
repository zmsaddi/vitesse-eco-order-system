import { z } from "zod";

// Phase 3.0 orders core DTO. Minimal shape — multi-item creation + cancel + start-prep.
// Deferred to later Phase 3 tranches: VIN validation, discount engine, gift_pool logic,
// commission snapshots. Not deferred: activity_log + idempotency on every mutation.

export const OrderItemDto = z.object({
  id: z.number().int().positive(),
  orderId: z.number().int().positive(),
  productId: z.number().int().positive(),
  productNameCached: z.string(),
  category: z.string().default(""),
  quantity: z.number(),
  recommendedPrice: z.number(),
  unitPrice: z.number(),
  // costPrice is optional on the DTO because it's role-redacted at the response
  // boundary (16_Data_Visibility: seller/driver/stock_keeper do NOT see cost).
  // Internal callers (service + mapper) always populate it; route handlers strip
  // it via redactOrderForRole() before JSON serialization for the restricted roles.
  costPrice: z.number().optional(),
  discountType: z.enum(["percent", "fixed"]).nullable(),
  discountValue: z.number().nullable(),
  lineTotal: z.number(),
  isGift: z.boolean(),
  vin: z.string().default(""),
  // Phase 3.1.3: optional because stock_keeper has no commission standing and
  // the field is stripped entirely in their response. For seller + driver the
  // snapshot is PARTIALLY filtered (only role-relevant keys) in
  // redactOrderForRole. Internal callers (mapper) always populate it.
  commissionRuleSnapshot: z.record(z.string(), z.unknown()).optional(),
});
export type OrderItemDto = z.infer<typeof OrderItemDto>;

export const OrderDto = z.object({
  id: z.number().int().positive(),
  refCode: z.string(),
  date: z.string(),
  clientId: z.number().int().positive(),
  clientNameCached: z.string(),
  clientPhoneCached: z.string().default(""),
  status: z.string(),
  paymentMethod: z.string(),
  paymentStatus: z.string(),
  totalAmount: z.number(),
  advancePaid: z.number(),
  notes: z.string().default(""),
  createdBy: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
  items: z.array(OrderItemDto),
});
export type OrderDto = z.infer<typeof OrderDto>;

// Create input — client may either send a final unitPrice directly, OR
// send recommended + explicit discount (type + value). Both paths end up with
// a post-discount unitPrice at storage time; pricing.ts derives + enforces BR-41.
// isGift=true short-circuits pricing → 0/0.
export const CreateOrderItemInput = z
  .object({
    productId: z.number().int().positive(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    discountType: z.enum(["percent", "fixed"]).optional(),
    discountValue: z.number().min(0).optional(),
    isGift: z.boolean().default(false),
    vin: z.string().max(64).default(""),
  })
  .refine(
    (v) => {
      if (v.discountType === "percent" && v.discountValue !== undefined) {
        return v.discountValue >= 0 && v.discountValue <= 100;
      }
      return true;
    },
    { message: "قيمة الخصم النسبي يجب أن تكون بين 0 و 100", path: ["discountValue"] },
  )
  .refine(
    (v) => (v.discountType === undefined) === (v.discountValue === undefined),
    { message: "discountType وdiscountValue يجب أن يمررا معاً أو يُتركا معاً", path: ["discountValue"] },
  );
export type CreateOrderItemInput = z.infer<typeof CreateOrderItemInput>;

export const CreateOrderInput = z
  .object({
    clientId: z.number().int().positive(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD"),
    paymentMethod: z.enum(["كاش", "بنك", "آجل"]).default("كاش"),
    notes: z.string().max(2048).default(""),
    items: z.array(CreateOrderItemInput).min(1, "يجب إضافة صنف واحد على الأقل"),
  })
  .refine(
    (v) => v.items.every((i) => !i.isGift || i.unitPrice === 0),
    { message: "الصنف الهدية يجب أن يكون unitPrice=0", path: ["items"] },
  );
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

// Cancel input — C1 dialog fields (BR-18 — 3 required choices).
export const CancelOrderInput = z.object({
  reason: z.string().min(1, "السبب مطلوب").max(1024),
  returnToStock: z.boolean(),
  sellerBonusAction: z.enum(["keep", "cancel_unpaid", "cancel_as_debt"]),
  driverBonusAction: z.enum(["keep", "cancel_unpaid", "cancel_as_debt"]),
});
export type CancelOrderInput = z.infer<typeof CancelOrderInput>;
