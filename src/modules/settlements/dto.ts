import { z } from "zod";
import { isTwoDecimalPrecise } from "@/lib/money";

// Phase 4.4 — settlements + rewards DTOs.
//
// POST /api/v1/settlements body is a discriminated union on `kind`:
//   - "settlement"  pays out a user's unpaid bonuses; consumes ALL unapplied
//                   debt rows for that (userId, role) all-or-nothing; if the
//                   debt exceeds the bonus gross, the call rejects.
//   - "reward"      a discretionary payout; touches no bonus and no debt row.
//
// paymentMethod is LOCKED to {"كاش","بنك"} (no "آجل") — every payout that
// exits main_cash or main_bank is a real cash outflow that writes a
// treasury_movement. "آجل" here would be a contract lie. Service layer
// also enforces the cross-invariant main_cash↔كاش / main_bank↔بنك under the
// SETTLEMENT_SOURCE_ACCOUNT_INVALID umbrella code (cf. service.ts).

const PayoutPaymentMethod = z.enum(["كاش", "بنك"]);
export type PayoutPaymentMethod = z.infer<typeof PayoutPaymentMethod>;

export const SettlementPayoutInput = z.object({
  kind: z.literal("settlement"),
  userId: z.number().int().positive(),
  bonusIds: z.array(z.number().int().positive()).min(1, "bonusIds فارغة"),
  fromAccountId: z.number().int().positive(),
  paymentMethod: PayoutPaymentMethod,
  notes: z.string().max(2048).default(""),
});
export type SettlementPayoutInput = z.infer<typeof SettlementPayoutInput>;

export const RewardPayoutInput = z.object({
  kind: z.literal("reward"),
  userId: z.number().int().positive(),
  amount: z
    .number()
    .positive()
    .max(1_000_000)
    .refine(isTwoDecimalPrecise, {
      message: "المبلغ يجب أن يكون بدقة سنتين (2 decimals max).",
    }),
  fromAccountId: z.number().int().positive(),
  paymentMethod: PayoutPaymentMethod,
  notes: z.string().max(2048).default(""),
});
export type RewardPayoutInput = z.infer<typeof RewardPayoutInput>;

export const CreateSettlementInput = z.discriminatedUnion("kind", [
  SettlementPayoutInput,
  RewardPayoutInput,
]);
export type CreateSettlementInput = z.infer<typeof CreateSettlementInput>;

// GET /api/v1/settlements query — pm/gm list with simple pagination.
export const ListSettlementsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  userId: z.coerce.number().int().positive().optional(),
  role: z.enum(["seller", "driver", "manager", "pm", "gm", "stock_keeper"]).optional(),
  type: z.enum(["settlement", "reward", "debt"]).optional(),
});
export type ListSettlementsQuery = z.infer<typeof ListSettlementsQuery>;

// GET /api/v1/bonuses query — shared by pm/gm (audit) and seller/driver (own-only).
// The service FORCES userId=claims.userId for seller/driver regardless of
// what the caller sends; pm/gm may filter via `userId`.
export const ListBonusesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["unpaid", "settled", "retained"]).optional(),
  userId: z.coerce.number().int().positive().optional(),
});
export type ListBonusesQuery = z.infer<typeof ListBonusesQuery>;

// Response DTOs — narrow, explicit shapes (no leakage of internal columns).
export const SettlementDto = z.object({
  id: z.number().int().positive(),
  date: z.string(),
  userId: z.number().int().positive(),
  username: z.string(),
  role: z.string(),
  type: z.enum(["settlement", "reward", "debt"]),
  amount: z.string(), // numeric(19,2) — signed on 'debt', unsigned otherwise
  paymentMethod: z.string(),
  notes: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  applied: z.boolean(),
  appliedInSettlementId: z.number().int().positive().nullable(),
});
export type SettlementDto = z.infer<typeof SettlementDto>;

export const BonusDto = z.object({
  id: z.number().int().positive(),
  date: z.string(),
  userId: z.number().int().positive(),
  username: z.string(),
  role: z.string(),
  orderId: z.number().int().positive(),
  deliveryId: z.number().int().positive(),
  totalBonus: z.string(),
  status: z.enum(["unpaid", "settled", "retained"]),
  settlementId: z.number().int().positive().nullable(),
  notes: z.string(),
});
export type BonusDto = z.infer<typeof BonusDto>;

export const BonusesSummaryDto = z.object({
  unpaidTotal: z.string(),
  retainedTotal: z.string(),
  settledTotal: z.string(),
  debtOutstanding: z.string(), // |SUM(debt)| — positive magnitude
  availableCredit: z.string(), // round2(unpaidTotal + debtTotal) where debt<=0
});
export type BonusesSummaryDto = z.infer<typeof BonusesSummaryDto>;
