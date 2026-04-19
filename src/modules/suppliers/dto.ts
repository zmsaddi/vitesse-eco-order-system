import { z } from "zod";

// D-69: Suppliers DTO. Soft-disable via `active` (H6). credit_due_from_supplier
// is read-only from this surface (managed internally by purchase-reverse flow — D-10 + D-62).

export const SupplierDto = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(256),
  phone: z.string().max(64).default(""),
  address: z.string().max(1024).default(""),
  notes: z.string().max(2048).default(""),
  creditDueFromSupplier: z.number(),
  active: z.boolean(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type SupplierDto = z.infer<typeof SupplierDto>;

export const CreateSupplierInput = z.object({
  name: z.string().min(1).max(256),
  phone: z.string().max(64).default(""),
  address: z.string().max(1024).default(""),
  notes: z.string().max(2048).default(""),
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierInput>;

export const UpdateSupplierPatch = z
  .object({
    name: z.string().min(1).max(256).optional(),
    phone: z.string().max(64).optional(),
    address: z.string().max(1024).optional(),
    notes: z.string().max(2048).optional(),
    active: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, {
    message: "يجب تمرير حقل واحد على الأقل للتعديل",
  });
export type UpdateSupplierPatch = z.infer<typeof UpdateSupplierPatch>;
