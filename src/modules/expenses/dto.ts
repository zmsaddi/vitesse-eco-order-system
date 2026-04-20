import { z } from "zod";

// Phase 3.0 expenses — GET/POST/PUT + structured reverse (D-82).
// NO DELETE: all corrections go through /[id]/reverse.

export const ExpenseDto = z.object({
  id: z.number().int().positive(),
  date: z.string(),
  category: z.string(),
  description: z.string(),
  amount: z.number(),
  paymentMethod: z.string(),
  comptableClass: z.string().nullable(),
  notes: z.string().default(""),
  reversalOf: z.number().int().positive().nullable(),
  createdBy: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
export type ExpenseDto = z.infer<typeof ExpenseDto>;

export const CreateExpenseInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(1).max(128),
  description: z.string().min(1).max(1024),
  amount: z.number().positive(), // create paths always positive; negative is via reverse only
  paymentMethod: z.enum(["كاش", "بنك", "آجل"]).default("كاش"),
  comptableClass: z.string().max(16).nullable().default(null),
  notes: z.string().max(2048).default(""),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseInput>;

export const UpdateExpenseInput = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    category: z.string().min(1).max(128).optional(),
    description: z.string().min(1).max(1024).optional(),
    amount: z.number().optional(), // sign must still satisfy CHECK (negative only if reversal)
    paymentMethod: z.enum(["كاش", "بنك", "آجل"]).optional(),
    comptableClass: z.string().max(16).nullable().optional(),
    notes: z.string().max(2048).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, {
    message: "يجب تمرير حقل واحد على الأقل للتعديل",
  });
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseInput>;

// D-82 reverse payload — reason stored in notes of the new row.
export const ReverseExpenseInput = z.object({
  reason: z.string().min(1).max(1024),
});
export type ReverseExpenseInput = z.infer<typeof ReverseExpenseInput>;
