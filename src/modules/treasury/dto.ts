import { z } from "zod";

// Phase 4.2 — treasury DTOs.
//
// - TreasuryAccountDto: balance, type, owner, parent — what GET /api/v1/treasury returns.
// - TreasuryMovementDto: the immutable movement row shape (D-58 append-only).
// - HandoverInput: request body for POST /api/v1/treasury/handover.
//
// No row_hash / prev_hash columns on treasury tables in this tranche (per
// Phase 4.2 scope — hash-chain deferred). Append-only guaranteed by the
// D-58 trigger `treasury_movements_no_update`.

export const TreasuryAccountDto = z.object({
  id: z.number().int().positive(),
  type: z.enum(["main_cash", "main_bank", "manager_box", "driver_custody"]),
  name: z.string(),
  ownerUserId: z.number().int().positive().nullable(),
  parentAccountId: z.number().int().positive().nullable(),
  balance: z.string(), // numeric(19,2)
  active: z.boolean(),
  createdAt: z.string(), // ISO timestamp
});
export type TreasuryAccountDto = z.infer<typeof TreasuryAccountDto>;

export const TreasuryMovementDto = z.object({
  id: z.number().int().positive(),
  date: z.string(),
  category: z.string(),
  fromAccountId: z.number().int().positive().nullable(),
  toAccountId: z.number().int().positive().nullable(),
  amount: z.string(), // numeric(19,2) signed
  referenceType: z.string().nullable(),
  referenceId: z.number().int().positive().nullable(),
  notes: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type TreasuryMovementDto = z.infer<typeof TreasuryMovementDto>;

// POST /api/v1/treasury/handover body.
// - Driver caller: amount from own custody. `driverUserId` is ignored/forced
//   to caller.userId by the service (the client may omit it).
// - Manager caller: `driverUserId` required; the driver must have
//   manager_id = caller.userId (enforced by service).
// - notes optional, up to 2048 chars (matches other mutation DTOs).
export const HandoverInput = z.object({
  amount: z
    .number()
    .positive()
    .max(1_000_000), // BR-55b cap is far below this; this is a sanity ceiling only.
  driverUserId: z.number().int().positive().optional(),
  notes: z.string().max(2048).default(""),
});
export type HandoverInput = z.infer<typeof HandoverInput>;

// GET /api/v1/treasury query — simple pagination for movements.
export const ListTreasuryQuery = z.object({
  movementsLimit: z.coerce.number().int().min(1).max(500).default(100),
  movementsOffset: z.coerce.number().int().min(0).default(0),
});
export type ListTreasuryQuery = z.infer<typeof ListTreasuryQuery>;

// Response shape for GET /api/v1/treasury. Explicit for the driver/admin UI.
export const TreasurySnapshotDto = z.object({
  accounts: z.array(TreasuryAccountDto),
  movements: z.array(TreasuryMovementDto),
  movementsTotal: z.number().int().nonnegative(),
});
export type TreasurySnapshotDto = z.infer<typeof TreasurySnapshotDto>;
