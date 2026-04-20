import { z } from "zod";

// Phase 4.0 driver_tasks — read-only list surface for the driver dashboard.
// Task lifecycle mirrors the linked delivery (pending ↔ in_progress ↔ completed)
// and is updated by the delivery service, never directly here.

export const DriverTaskDto = z.object({
  id: z.number().int().positive(),
  type: z.enum(["delivery", "supplier_pickup", "collection"]),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  assignedDriverId: z.number().int().positive(),
  relatedEntityType: z.string(),
  relatedEntityId: z.number().int().positive(),
  amountHint: z.number().nullable(),
  notes: z.string().default(""),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type DriverTaskDto = z.infer<typeof DriverTaskDto>;
