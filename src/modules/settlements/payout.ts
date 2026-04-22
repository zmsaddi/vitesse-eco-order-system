import { asc, eq, inArray } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import {
  bonuses,
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
import type { SettlementPayoutInput } from "./dto";
import { settlementRowToDto } from "./mappers";
import { lockUnappliedDebts, sumDebtAmount } from "./credit";
import {
  assertCanCreateSettlement,
  type SettlementClaims,
} from "./permissions";
import { assertSourceAccountForPayout } from "./source-account";

// Phase 4.4 — settlement payout (kind="settlement"). Consumes every unapplied
// debt row for the (userId, role) all-or-nothing, then either writes a
// single treasury_movement (netPayout>0) or a settlement row with amount=0
// (netPayout=0), and always writes activity_log + flips the bonuses to
// status='settled' with a settlement_id pointer.

export type SettlementPayoutResult = {
  settlement: ReturnType<typeof settlementRowToDto>;
  movementId: number | null;
  grossBonus: string;
  debtTotal: string;
  netPayout: string;
  bonusIdsApplied: number[];
  debtIdsApplied: number[];
};

export async function performSettlementPayout(
  tx: DbTx,
  input: SettlementPayoutInput,
  claims: SettlementClaims,
): Promise<SettlementPayoutResult> {
  assertCanCreateSettlement(claims);

  // Lock every requested bonus row up front (sorted ASC by id), so concurrent
  // callers observe the same set and the loser sees settlementId IS NOT NULL.
  const sortedIds = [...input.bonusIds].sort((a, b) => a - b);
  const lockedRaw = await tx
    .select({
      id: bonuses.id,
      userId: bonuses.userId,
      role: bonuses.role,
      status: bonuses.status,
      settlementId: bonuses.settlementId,
      deletedAt: bonuses.deletedAt,
      totalBonus: bonuses.totalBonus,
    })
    .from(bonuses)
    .where(inArray(bonuses.id, sortedIds))
    .orderBy(asc(bonuses.id))
    .for("update");

  if (lockedRaw.length !== sortedIds.length) {
    throw new BusinessRuleError(
      "قائمة العلاوات غير صحيحة — بعض المعرفات غير موجود.",
      "INVALID_SETTLEMENT_BONUS_SET",
      400,
      "performSettlementPayout: missing bonus id(s)",
      { requestedIds: sortedIds, foundIds: lockedRaw.map((r) => r.id) },
    );
  }

  const firstRole = lockedRaw[0].role;
  for (const r of lockedRaw) {
    if (
      r.userId !== input.userId ||
      r.role !== firstRole ||
      r.status !== "unpaid" ||
      r.settlementId !== null ||
      r.deletedAt !== null
    ) {
      throw new BusinessRuleError(
        "قائمة العلاوات غير صحيحة — الحالة/المالك/الدور غير متجانس.",
        "INVALID_SETTLEMENT_BONUS_SET",
        400,
        "performSettlementPayout: set uniformity violated",
        {
          bonusId: r.id,
          userId: r.userId,
          role: r.role,
          status: r.status,
          settlementId: r.settlementId,
          deleted: r.deletedAt !== null,
          expectedUserId: input.userId,
          expectedRole: firstRole,
        },
      );
    }
  }

  const grossBonus = round2(
    lockedRaw.reduce((acc, r) => acc + Number(r.totalBonus), 0),
  );

  // Validate the source account FIRST — cheap precondition. Running it before
  // the debt-consume path makes the wire contract predictable: a caller with
  // an invalid source always gets SETTLEMENT_SOURCE_ACCOUNT_INVALID,
  // regardless of the user's debt state.
  const source = await lockAccountForUpdate(tx, input.fromAccountId);
  if (!source) {
    throw new ConflictError(
      "حساب الصندوق غير موجود.",
      "TREASURY_ACCOUNT_MISSING",
      { accountId: input.fromAccountId },
    );
  }
  assertSourceAccountForPayout(source.type, input.paymentMethod, source.id);

  // Lock ALL unapplied debts for this (userId, role) in the same tx.
  const debtRows = await lockUnappliedDebts(tx, input.userId, firstRole);
  const debtTotal = sumDebtAmount(debtRows); // <= 0

  const netPayout = round2(grossBonus + debtTotal);

  if (netPayout < 0) {
    throw new ConflictError(
      "الديون المتراكمة تتجاوز مجموع العلاوات — لا يمكن الصرف.",
      "DEBT_EXCEEDS_PAYOUT",
      { grossBonus, debtTotal, netPayout, userId: input.userId, role: firstRole },
    );
  }

  const sourceBalance = parseNumeric(source.balance);
  if (netPayout > 0 && netPayout > sourceBalance + 0.005) {
    throw new ConflictError(
      `الرصيد (${sourceBalance.toFixed(2)}€) أقل من صافي المبلغ (${netPayout.toFixed(2)}€).`,
      "INSUFFICIENT_BALANCE",
      { fromAccountId: source.id, balance: sourceBalance, amount: netPayout },
    );
  }

  const today = parisIsoDate(new Date());
  const targetUsername = await resolveUsername(tx, input.userId);

  const insertedSettlement = await tx
    .insert(settlements)
    .values({
      date: today,
      userId: input.userId,
      username: targetUsername,
      role: firstRole,
      type: "settlement",
      amount: netPayout.toFixed(2),
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning();
  const settlementRow = insertedSettlement[0];

  await tx
    .update(bonuses)
    .set({ settlementId: settlementRow.id, status: "settled" })
    .where(inArray(bonuses.id, sortedIds));

  const debtIds = debtRows.map((r) => r.id);
  if (debtIds.length > 0) {
    await tx
      .update(settlements)
      .set({ applied: true, appliedInSettlementId: settlementRow.id })
      .where(inArray(settlements.id, debtIds));
  }

  let movementId: number | null = null;
  if (netPayout > 0) {
    const newBalance = round2(sourceBalance - netPayout);
    await tx
      .update(treasuryAccounts)
      .set({ balance: newBalance.toFixed(2) })
      .where(eq(treasuryAccounts.id, source.id));

    const insertedMv = await tx
      .insert(treasuryMovements)
      .values({
        date: today,
        category: "settlement",
        fromAccountId: source.id,
        toAccountId: null,
        amount: netPayout.toFixed(2),
        referenceType: "settlement",
        referenceId: settlementRow.id,
        notes: input.notes,
        createdBy: claims.username,
      })
      .returning({ id: treasuryMovements.id });
    movementId = insertedMv[0].id;
  }

  await logActivity(tx, {
    action: "create",
    entityType: "settlements",
    entityId: settlementRow.id,
    userId: claims.userId,
    username: claims.username,
    details: {
      kind: "settlement",
      targetUserId: input.userId,
      role: firstRole,
      bonusIdsApplied: sortedIds,
      debtIdsApplied: debtIds,
      grossBonus,
      debtTotal,
      netPayout,
      movementId,
      fromAccountId: source.id,
      fromAccountType: source.type,
    },
  });

  // Phase 5.1 — SETTLEMENT_ISSUED → target user (line 38 of the matrix).
  await emitNotifications(tx, {
    type: "SETTLEMENT_ISSUED",
    settlementId: settlementRow.id,
    targetUserId: input.userId,
    kind: "settlement",
    amount: netPayout.toFixed(2),
  });

  return {
    settlement: settlementRowToDto(settlementRow),
    movementId,
    grossBonus: grossBonus.toFixed(2),
    debtTotal: debtTotal.toFixed(2),
    netPayout: netPayout.toFixed(2),
    bonusIdsApplied: sortedIds,
    debtIdsApplied: debtIds,
  };
}

async function resolveUsername(tx: DbTx, userId: number): Promise<string> {
  const rows = await tx
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) {
    throw new NotFoundError(`المستخدم رقم ${userId}`);
  }
  return rows[0].username;
}
