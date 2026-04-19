import { z } from "zod";

// D-69: Products DTO. Soft-disable via `active=false` (H6); never hard-deleted.
// Minimal fields in Phase 2c; images + specs JSONB are present in schema but
// exposed via minimal surface here (specs as record; images managed separately in Phase 3).

export const ProductDto = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(256),
  category: z.string().default(""),
  unit: z.string().default(""),
  buyPrice: z.number(),
  sellPrice: z.number(),
  stock: z.number(),
  lowStockThreshold: z.number().int().min(0),
  active: z.boolean(),
  descriptionAr: z.string().default(""),
  descriptionLong: z.string().default(""),
  specs: z.record(z.string(), z.unknown()).default({}),
  catalogVisible: z.boolean(),
  notes: z.string().default(""),
  createdBy: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type ProductDto = z.infer<typeof ProductDto>;

// Create input — BR-01/BR-02/BR-03: sellPrice must be >= buyPrice (enforced in service).
export const CreateProductInput = z.object({
  name: z.string().min(1).max(256),
  category: z.string().max(128).default(""),
  unit: z.string().max(64).default(""),
  buyPrice: z.number().min(0),
  sellPrice: z.number().min(0),
  stock: z.number().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(3),
  descriptionAr: z.string().max(2048).default(""),
  descriptionLong: z.string().max(8192).default(""),
  specs: z.record(z.string(), z.unknown()).default({}),
  catalogVisible: z.boolean().default(true),
  notes: z.string().max(2048).default(""),
}).refine((p) => p.sellPrice >= p.buyPrice, {
  message: "سعر البيع يجب أن يكون أكبر أو مساوياً لسعر الشراء (BR-03)",
  path: ["sellPrice"],
});
export type CreateProductInput = z.infer<typeof CreateProductInput>;

// Partial patch for edit — at least one field required.
// sellPrice >= buyPrice enforced at service layer (need current values + patch values to compare).
export const UpdateProductPatch = z
  .object({
    name: z.string().min(1).max(256).optional(),
    category: z.string().max(128).optional(),
    unit: z.string().max(64).optional(),
    buyPrice: z.number().min(0).optional(),
    sellPrice: z.number().min(0).optional(),
    stock: z.number().min(0).optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
    descriptionAr: z.string().max(2048).optional(),
    descriptionLong: z.string().max(8192).optional(),
    specs: z.record(z.string(), z.unknown()).optional(),
    catalogVisible: z.boolean().optional(),
    notes: z.string().max(2048).optional(),
    active: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, {
    message: "يجب تمرير حقل واحد على الأقل للتعديل",
  });
export type UpdateProductPatch = z.infer<typeof UpdateProductPatch>;
