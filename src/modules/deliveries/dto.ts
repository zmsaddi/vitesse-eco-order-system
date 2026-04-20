import { z } from "zod";

// Phase 4.0 deliveries core DTO. Minimal shape — create from ready order,
// driver start transition, confirm with collection + bonus computation.
// Delivery status values (08_State_Transitions §3, Arabic enum):
//   "جاهز" → ready for driver pickup (created here when order reaches "جاهز").
//   "جاري التوصيل" → driver started the trip.
//   "تم التوصيل" → driver confirmed delivery (terminal; spawns payments + bonuses).

export const DeliveryDto = z.object({
  id: z.number().int().positive(),
  refCode: z.string(),
  date: z.string(),
  orderId: z.number().int().positive(),
  clientId: z.number().int().positive(),
  clientNameCached: z.string(),
  clientPhoneCached: z.string().default(""),
  address: z.string().default(""),
  status: z.string(),
  assignedDriverId: z.number().int().positive().nullable(),
  assignedDriverUsernameCached: z.string().default(""),
  notes: z.string().default(""),
  confirmationDate: z.string().nullable(),
  createdBy: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
export type DeliveryDto = z.infer<typeof DeliveryDto>;

// Create input — pm/gm/manager.
// orderId must reference an order currently in status "جاهز" (service enforces).
// assignedDriverId optional here — can be assigned now or reassigned later.
export const CreateDeliveryInput = z.object({
  orderId: z.number().int().positive(),
  assignedDriverId: z.number().int().positive().nullable().default(null),
  notes: z.string().max(2048).default(""),
});
export type CreateDeliveryInput = z.infer<typeof CreateDeliveryInput>;

// Confirm-delivery input — driver (assigned) or admin.
// paidAmount is 0-allowed (credit sale delivered before payment); service enforces
// paid >= 0 and ≤ total - alreadyAdvanced if that rule applies.
// paymentMethod: optional; if omitted, inherits from the order's paymentMethod.
export const ConfirmDeliveryInput = z.object({
  paidAmount: z.number().min(0).default(0),
  paymentMethod: z.enum(["كاش", "بنك", "آجل"]).optional(),
  notes: z.string().max(2048).default(""),
});
export type ConfirmDeliveryInput = z.infer<typeof ConfirmDeliveryInput>;
