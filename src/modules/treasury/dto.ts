import { z } from "zod";
import { isTwoDecimalPrecise } from "@/lib/money";

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
//
// Phase 4.3.2 — strict 2-decimal precision on amount: sub-cent values
// (0.004, 0.005, …) are rejected at the schema layer before reaching
// `round2` in the service, which would otherwise collapse them to 0.00 and
// silently insert a zero-value movement row.
export const HandoverInput = z.object({
  amount: z
    .number()
    .positive()
    .max(1_000_000) // BR-55b cap is far below this; this is a sanity ceiling only.
    .refine(isTwoDecimalPrecise, {
      message: "المبلغ يجب أن يكون بدقة سنتين (2 decimals max).",
    }),
  driverUserId: z.number().int().positive().optional(),
  notes: z.string().max(2048).default(""),
});
export type HandoverInput = z.infer<typeof HandoverInput>;

// Phase 4.3 — POST /api/v1/treasury/transfer. Category is server-inferred
// from (from.type, to.type) against the 4-route allowlist in transfer.ts;
// the caller does NOT specify it. `amount > 0` is guarded at the schema
// layer + re-asserted at the service layer (defense-in-depth for any caller
// that bypasses Zod).
//
// Phase 4.3.1 — strict 2-decimal precision: a sub-cent amount (0.004, 0.005)
// is REJECTED at the schema layer. Rationale: after `round2(0.004) = 0.00`
// the service layer would otherwise silently insert a zero-value movement
// row. The refine below makes that scenario unreachable from the wire.
//
// Phase 4.3.2 — predicate promoted to `@/lib/money` so transfer / reconcile
// / handover / confirm-delivery all share the exact same check.

export const TransferInput = z.object({
  fromAccountId: z.number().int().positive(),
  toAccountId: z.number().int().positive(),
  amount: z
    .number()
    .positive()
    .max(10_000_000)
    .refine(isTwoDecimalPrecise, {
      message: "المبلغ يجب أن يكون بدقة سنتين (2 decimals max).",
    }),
  notes: z.string().max(2048).default(""),
});
export type TransferInput = z.infer<typeof TransferInput>;

// Phase 4.3 — POST /api/v1/treasury/reconcile. `actualBalance` is what the
// operator counted physically (cash) or read from the bank statement; the
// service compares it against the expected balance RECOMPUTED from
// treasury_movements (source of truth per 12_Accounting_Rules §reconcile),
// NOT against the cached treasury_accounts.balance. Zero is an allowed
// physical count → schema permits `.min(0)`.
//
// Phase 4.3.1 — strict 2-decimal precision applies here too.
export const ReconcileInput = z.object({
  accountId: z.number().int().positive(),
  actualBalance: z
    .number()
    .min(0)
    .max(100_000_000)
    .refine(isTwoDecimalPrecise, {
      message: "الرصيد يجب أن يكون بدقة سنتين (2 decimals max).",
    }),
  notes: z.string().max(2048).default(""),
});
export type ReconcileInput = z.infer<typeof ReconcileInput>;

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
