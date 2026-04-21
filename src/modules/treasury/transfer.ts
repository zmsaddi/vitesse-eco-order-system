import { eq } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { treasuryAccounts, treasuryMovements } from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import type { TransferInput } from "./dto";
import {
  lockAccountForUpdate,
  parisIsoDate,
  parseNumeric,
  round2,
} from "./accounts";
import {
  assertCanTransfer,
  type TreasuryClaims,
} from "./permissions";

// Phase 4.3 — treasury transfer between two NON-custody accounts. Scope
// strictly limited to the four canonical routes below (BR-52 + reviewer
// decision 2026-04-21):
//
//   main_cash   → manager_box  = 'funding'
//   manager_box → main_cash    = 'manager_settlement'
//   main_cash   → main_bank    = 'bank_deposit'
//   main_bank   → main_cash    = 'bank_withdrawal'
//
// Any other (fromType, toType) pair raises INVALID_TRANSFER_ROUTE. Category
// is derived server-side, never taken from the caller — closes off the
// attack where a bad category disguises an off-chart movement.

type AllowedPair = { from: string; to: string; category: string };

const TRANSFER_ROUTES: readonly AllowedPair[] = [
  { from: "main_cash", to: "manager_box", category: "funding" },
  { from: "manager_box", to: "main_cash", category: "manager_settlement" },
  { from: "main_cash", to: "main_bank", category: "bank_deposit" },
  { from: "main_bank", to: "main_cash", category: "bank_withdrawal" },
] as const;

function routeCategory(fromType: string, toType: string): string | null {
  for (const r of TRANSFER_ROUTES) {
    if (r.from === fromType && r.to === toType) return r.category;
  }
  return null;
}

export type TransferResult = {
  movementId: number;
  category: string;
  fromBalance: string;
  toBalance: string;
};

export async function performTransfer(
  tx: DbTx,
  input: TransferInput,
  claims: TreasuryClaims,
): Promise<TransferResult> {
  assertCanTransfer(claims);

  // Defense-in-depth guard: Zod already enforces `amount > 0`, but re-check
  // here in case a caller constructs the service call directly.
  if (input.amount <= 0) {
    throw new BusinessRuleError(
      "مبلغ التحويل يجب أن يكون موجباً.",
      "VALIDATION_FAILED",
      400,
    );
  }

  if (input.fromAccountId === input.toAccountId) {
    throw new ConflictError(
      "لا يمكن التحويل من حساب إلى نفسه.",
      "INVALID_TRANSFER_ROUTE",
      { fromAccountId: input.fromAccountId, toAccountId: input.toAccountId },
    );
  }

  // Canonical lock order: lower id first to avoid deadlocks when two
  // concurrent transfers touch the same pair of accounts in opposite
  // directions.
  const [firstId, secondId] =
    input.fromAccountId < input.toAccountId
      ? [input.fromAccountId, input.toAccountId]
      : [input.toAccountId, input.fromAccountId];
  await lockAccountForUpdate(tx, firstId);
  await lockAccountForUpdate(tx, secondId);

  const fromAcct = await lockAccountForUpdate(tx, input.fromAccountId);
  const toAcct = await lockAccountForUpdate(tx, input.toAccountId);
  if (!fromAcct || !toAcct) {
    throw new ConflictError(
      "حساب الصندوق غير موجود.",
      "TREASURY_ACCOUNT_MISSING",
      {
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
      },
    );
  }

  const category = routeCategory(fromAcct.type, toAcct.type);
  if (!category) {
    throw new ConflictError(
      `المسار غير مسموح: ${fromAcct.type} → ${toAcct.type}.`,
      "INVALID_TRANSFER_ROUTE",
      {
        fromType: fromAcct.type,
        toType: toAcct.type,
        allowedRoutes: TRANSFER_ROUTES,
      },
    );
  }

  const amount = round2(input.amount);
  const fromBalance = parseNumeric(fromAcct.balance);
  if (amount > fromBalance + 0.005) {
    throw new ConflictError(
      `الرصيد (${fromBalance.toFixed(2)}€) أقل من مبلغ التحويل (${amount.toFixed(2)}€).`,
      "INSUFFICIENT_BALANCE",
      {
        fromAccountId: fromAcct.id,
        balance: fromBalance,
        amount,
      },
    );
  }

  const newFrom = round2(fromBalance - amount);
  const newTo = round2(parseNumeric(toAcct.balance) + amount);

  await tx
    .update(treasuryAccounts)
    .set({ balance: newFrom.toFixed(2) })
    .where(eq(treasuryAccounts.id, fromAcct.id));
  await tx
    .update(treasuryAccounts)
    .set({ balance: newTo.toFixed(2) })
    .where(eq(treasuryAccounts.id, toAcct.id));

  const inserted = await tx
    .insert(treasuryMovements)
    .values({
      date: parisIsoDate(new Date()),
      category,
      fromAccountId: fromAcct.id,
      toAccountId: toAcct.id,
      amount: amount.toFixed(2),
      referenceType: null,
      referenceId: null,
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning({ id: treasuryMovements.id });
  const movementId = inserted[0].id;

  await logActivity(tx, {
    action: "create",
    entityType: "treasury_movements",
    entityId: movementId,
    userId: claims.userId,
    username: claims.username,
    details: {
      kind: "transfer",
      category,
      fromAccountId: fromAcct.id,
      fromType: fromAcct.type,
      toAccountId: toAcct.id,
      toType: toAcct.type,
      amount,
      fromBalanceAfter: newFrom,
      toBalanceAfter: newTo,
    },
  });

  return {
    movementId,
    category,
    fromBalance: newFrom.toFixed(2),
    toBalance: newTo.toFixed(2),
  };
}
