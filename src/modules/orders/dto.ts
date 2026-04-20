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
  unitPrice: z.number(),
  costPrice: z.number(),
  lineTotal: z.number(),
  isGift: z.boolean(),
  vin: z.string().default(""),
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

// Create input — each item provides product + qty + unitPrice; service snapshots cost.
export const CreateOrderItemInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  isGift: z.boolean().default(false),
  vin: z.string().max(64).default(""),
});
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
