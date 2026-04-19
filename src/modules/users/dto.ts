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
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;
