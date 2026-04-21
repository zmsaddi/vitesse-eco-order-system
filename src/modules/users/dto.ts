import { z } from "zod";

// D-69: DTO layer منفصل عن Drizzle schema.
// هذه هي الـ shape الظاهرة للـ API والـ UI والـ Android client — ليست DB shape.

export const RoleDto = z.enum(["pm", "gm", "manager", "seller", "driver", "stock_keeper"]);

export const UserDto = z.object({
  id: z.number().int().positive(),
  username: z.string().min(3).max(64),
  name: z.string().min(1),
  role: RoleDto,
  active: z.boolean(),
  profitSharePct: z.number().min(0).max(100),
  profitShareStart: z.string().nullable(), // YYYY-MM-DD
  onboardedAt: z.string().nullable(), // ISO timestamp
  // Phase 4.2 — only meaningful when role='driver'. Active drivers MUST
  // have a managerId (enforced at service layer via DRIVER_MANAGER_REQUIRED).
  managerId: z.number().int().positive().nullable(),
  createdAt: z.string(), // ISO timestamp
});
export type UserDto = z.infer<typeof UserDto>;

// Public-facing user (masks profit_share for non-admin roles)
export const PublicUserDto = UserDto.omit({ profitSharePct: true, profitShareStart: true });
export type PublicUserDto = z.infer<typeof PublicUserDto>;

// Create input — server generates id + createdAt + onboardedAt
export const CreateUserInput = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_-]+$/, "lowercase + digits + _ / -"),
  password: z.string().min(8),
  name: z.string().min(1),
  role: RoleDto,
  profitSharePct: z.number().min(0).max(100).default(0),
  profitShareStart: z.string().nullable().default(null),
  // Phase 4.2 — driver create/update must supply managerId; other roles may omit.
  managerId: z.number().int().positive().nullable().default(null),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

// Partial patch for PUT /api/v1/users/[id] — ALL fields optional, but at least one required.
// Shared source of truth: imported by BOTH the API route handler AND the
// /users/[id]/edit Server Action so both validate identically (Phase 2b.1 fix).
export const UpdateUserPatch = z
  .object({
    name: z.string().min(1).max(256).optional(),
    role: RoleDto.optional(),
    active: z.boolean().optional(),
    profitSharePct: z.number().min(0).max(100).optional(),
    profitShareStart: z.string().nullable().optional(),
    managerId: z.number().int().positive().nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "يجب تمرير حقل واحد على الأقل للتعديل",
  });
export type UpdateUserPatch = z.infer<typeof UpdateUserPatch>;
