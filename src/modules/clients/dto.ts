import { z } from "zod";

// D-69: Clients DTO — API shape, decoupled from Drizzle row.
// Soft-delete: active clients have `deletedAt: null`.

export const ClientDto = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(256),
  latinName: z.string().max(256).default(""),
  phone: z.string().max(64).default(""),
  email: z.string().max(256).default(""),
  address: z.string().max(1024).default(""),
  descriptionAr: z.string().max(2048).default(""),
  notes: z.string().max(2048).default(""),
  createdBy: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),   // ISO
  deletedAt: z.string().nullable(),   // ISO; null = active
  createdAt: z.string(),              // ISO
});
export type ClientDto = z.infer<typeof ClientDto>;

// Create input — server assigns id, createdBy (from claims), createdAt.
// Per spec: unique (name, phone) partial index means we need at least name.
export const CreateClientInput = z.object({
  name: z.string().min(1).max(256),
  latinName: z.string().max(256).default(""),
  phone: z.string().max(64).default(""),
  email: z.string().max(256).refine(
    (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "صيغة البريد الإلكتروني غير صحيحة",
  ).default(""),
  address: z.string().max(1024).default(""),
  descriptionAr: z.string().max(2048).default(""),
  notes: z.string().max(2048).default(""),
});
export type CreateClientInput = z.infer<typeof CreateClientInput>;

// Update input — same as create (full replace of user-provided fields).
// Server keeps name_cached / phone_cached on existing orders per D-20 (don't retro-update).
export const UpdateClientInput = CreateClientInput;
export type UpdateClientInput = z.infer<typeof UpdateClientInput>;
