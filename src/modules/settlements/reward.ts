import { eq } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import {
  settlements,
  treasuryAccounts,
  treasuryMovements,
  users,
} from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import { round2 } from "@/lib/money";
import { emitNotifications } from "@/modules/notifications/events";
import {
  lockAccountForUpdate,
  parisIsoDate,
  parseNumeric,
} from "@/modules/treasury/accounts";
import type { RewardPayoutInput } from "./dto";
import { settlementRowToDto } from "./mappers";
import {
  assertCanCreateSettlement,
  type SettlementClaims,
} from "./permissions";
import { assertSourceAccountForPayout } from "./source-account";

// Phase 4.4 — reward payout (kind="reward"). First-class type, NOT a
// bonus-payout shortcut: never touches bonuses, never consumes debt. Writes
// exactly one settlement row + one treasury_movement (category='reward').

export type RewardPayoutResult = {
  settlement: ReturnType<typeof settlementRowToDto>;
  movementId: number;
};

export async function performRewardPayout(
  tx: DbTx,
  input: RewardPayoutInput,
  claims: SettlementClaims,
): Promise<RewardPayoutResult> {
  assertCanCreateSettlement(claims);

  const amount = round2(input.amount);
  if (amount < 0.01) {
    // Defense-in-depth: Zod refine already rejects sub-cent, but a direct
    // service-level caller that bypasses Zod could still get 0.004 here.
    throw new BusinessRuleError(
      "المبلغ يجب أن يكون 0.01€ على الأقل.",
      "VALIDATION_FAILED",
      400,
      "performRewardPayout: rounded amount below 0.01",
      { rawAmount: input.amount, roundedAmount: amount },
    );
  }

  // Resolve target user — reward records the recipient's role; lookup also
  // acts as an existence check before any money moves.
  const userRows = await tx
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  const user = userRows[0];
  if (!user || !user.active) {
    throw new NotFoundError(`المستخدم رقم ${input.userId}`);
  }

  const source = await lockAccountForUpdate(tx, input.fromAccountId);
  if (!source) {
    throw new ConflictError(
      "حساب الصندوق غير موجود.",
      "TREASURY_ACCOUNT_MISSING",
      { accountId: input.fromAccountId },
    );
  }
  assertSourceAccountForPayout(source.type, input.paymentMethod, source.id);

  const sourceBalance = parseNumeric(source.balance);
  if (amount > sourceBalance + 0.005) {
    throw new ConflictError(
      `الرصيد (${sourceBalance.toFixed(2)}€) أقل من مبلغ المكافأة (${amount.toFixed(2)}€).`,
      "INSUFFICIENT_BALANCE",
      { fromAccountId: source.id, balance: sourceBalance, amount },
    );
  }

  const today = parisIsoDate(new Date());
  const insertedSettlement = await tx
    .insert(settlements)
    .values({
      date: today,
      userId: user.id,
      username: user.username,
      role: user.role,
      type: "reward",
      amount: amount.toFixed(2),
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning();
  const settlementRow = insertedSettlement[0];

  const newBalance = round2(sourceBalance - amount);
  await tx
    .update(treasuryAccounts)
    .set({ balance: newBalance.toFixed(2) })
    .where(eq(treasuryAccounts.id, source.id));

  const insertedMv = await tx
    .insert(treasuryMovements)
    .values({
      date: today,
      category: "reward",
      fromAccountId: source.id,
      toAccountId: null,
      amount: amount.toFixed(2),
      referenceType: "settlement",
      referenceId: settlementRow.id,
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning({ id: treasuryMovements.id });

  await logActivity(tx, {
    action: "create",
    entityType: "settlements",
    entityId: settlementRow.id,
    userId: claims.userId,
    username: claims.username,
    details: {
      kind: "reward",
      targetUserId: user.id,
      role: user.role,
      amount,
      movementId: insertedMv[0].id,
      fromAccountId: source.id,
      fromAccountType: source.type,
    },
  });

  // Phase 5.1 — SETTLEMENT_ISSUED (kind=reward) → target user (line 38 of matrix).
  await emitNotifications(tx, {
    type: "SETTLEMENT_ISSUED",
    settlementId: settlementRow.id,
    targetUserId: user.id,
    kind: "reward",
    amount: amount.toFixed(2),
  });

  return {
    settlement: settlementRowToDto(settlementRow),
    movementId: insertedMv[0].id,
  };
}
