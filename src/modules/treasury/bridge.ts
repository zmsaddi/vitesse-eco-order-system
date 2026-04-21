import { eq } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { settings, treasuryAccounts, treasuryMovements, users } from "@/db/schema";
import { BusinessRuleError, ConflictError } from "@/lib/api-errors";
import {
  findAccountByOwnerAndType,
  lockAccountForUpdate,
  parseNumeric,
  round2,
} from "./accounts";

// Phase 4.2 — collection → treasury bridge. Called from
// src/modules/deliveries/confirm.ts when paidAmount > 0. Enforces BR-55b
// (CUSTODY_CAP_EXCEEDED) before any state change inside the confirm tx.

async function readCustodyCapEur(tx: DbTx): Promise<number> {
  const rows = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "driver_custody_cap_eur"))
    .limit(1);
  const raw = rows[0]?.value ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export type BridgeCollectionArgs = {
  orderId: number;
  driverUserId: number;
  amount: number; // signed positive
  confirmDate: string; // YYYY-MM-DD Paris
  createdBy: string;
};

export type BridgeCollectionResult = {
  movementId: number;
  custodyBalance: string;
};

/**
 * Bridge a confirmed collection payment into treasury. Order of ops (all
 * within caller's tx):
 *   1. Resolve driver → must be active with non-null manager_id.
 *   2. Find driver_custody (auto-created when the driver was created).
 *   3. Lock custody FOR UPDATE.
 *   4. BR-55b: custody.balance + amount > driver_custody_cap_eur ⇒
 *      CUSTODY_CAP_EXCEEDED (409) with zero side effects.
 *   5. UPDATE custody.balance += amount.
 *   6. INSERT treasury_movement(from=NULL, to=custody.id, category=
 *      'sale_collection', reference=order).
 */
export async function bridgeCollection(
  tx: DbTx,
  args: BridgeCollectionArgs,
): Promise<BridgeCollectionResult> {
  if (args.amount <= 0) {
    throw new BusinessRuleError(
      "لا يمكن جسر تحصيل بمبلغ غير موجب.",
      "VALIDATION_FAILED",
      400,
    );
  }

  const drvRows = await tx
    .select({ id: users.id, managerId: users.managerId, active: users.active })
    .from(users)
    .where(eq(users.id, args.driverUserId))
    .limit(1);
  const drv = drvRows[0];
  if (!drv || !drv.active || drv.managerId == null) {
    throw new ConflictError(
      "لا يمكن تنفيذ عملية الصندوق: السائق غير مرتبط بمدير.",
      "CUSTODY_DRIVER_UNLINKED",
      { driverUserId: args.driverUserId },
    );
  }

  const custodyRef = await findAccountByOwnerAndType(
    tx,
    args.driverUserId,
    "driver_custody",
  );
  if (!custodyRef) {
    throw new ConflictError(
      "لا توجد عهدة للسائق.",
      "CUSTODY_DRIVER_UNLINKED",
      { driverUserId: args.driverUserId },
    );
  }

  const custody = await lockAccountForUpdate(tx, custodyRef.id);
  if (!custody) {
    throw new ConflictError("عهدة السائق غير موجودة.", "TREASURY_ACCOUNT_MISSING");
  }

  const cap = await readCustodyCapEur(tx);
  const amount = round2(args.amount);
  const current = parseNumeric(custody.balance);
  if (cap > 0 && current + amount > cap + 0.005) {
    throw new ConflictError(
      "تجاوزت السقف النقدي. سلِّم الأموال لمديرك أولاً.",
      "CUSTODY_CAP_EXCEEDED",
      {
        amount,
        custodyBalance: current,
        cap,
        driverUserId: args.driverUserId,
      },
    );
  }

  const newBalance = round2(current + amount);
  await tx
    .update(treasuryAccounts)
    .set({ balance: newBalance.toFixed(2) })
    .where(eq(treasuryAccounts.id, custody.id));

  const inserted = await tx
    .insert(treasuryMovements)
    .values({
      date: args.confirmDate,
      category: "sale_collection",
      fromAccountId: null,
      toAccountId: custody.id,
      amount: amount.toFixed(2),
      referenceType: "order",
      referenceId: args.orderId,
      notes: "",
      createdBy: args.createdBy,
    })
    .returning({ id: treasuryMovements.id });

  return {
    movementId: inserted[0].id,
    custodyBalance: newBalance.toFixed(2),
  };
}
