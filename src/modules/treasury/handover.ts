import { and, eq } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { treasuryAccounts, treasuryMovements, users } from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  PermissionError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import { emitNotifications } from "@/modules/notifications/events";
import type { HandoverInput } from "./dto";
import {
  findAccountByOwnerAndType,
  lockAccountForUpdate,
  parisIsoDate,
  parseNumeric,
  round2,
} from "./accounts";
import {
  assertCanHandover,
  type TreasuryClaims,
} from "./permissions";

// Phase 4.2 — driver→manager handover. Atomicity via FOR UPDATE on both the
// driver_custody and the manager_box in a canonical lock order (lower id
// first) to avoid deadlocks under concurrency.

type ResolvedDriver = { userId: number; name: string; managerId: number | null };

async function resolveHandoverDriver(
  tx: DbTx,
  input: HandoverInput,
  claims: TreasuryClaims,
): Promise<ResolvedDriver> {
  if (claims.role === "driver") {
    const rows = await tx
      .select({ id: users.id, name: users.name, managerId: users.managerId })
      .from(users)
      .where(and(eq(users.id, claims.userId), eq(users.active, true)))
      .limit(1);
    if (!rows[0]) throw new PermissionError("لا تملك عهدة نشطة.");
    return { userId: rows[0].id, name: rows[0].name, managerId: rows[0].managerId };
  }
  if (claims.role === "manager") {
    if (!input.driverUserId) {
      throw new BusinessRuleError(
        "driverUserId مطلوب عند استلام التسليم من مدير.",
        "VALIDATION_FAILED",
        400,
      );
    }
    const rows = await tx
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        active: users.active,
        managerId: users.managerId,
      })
      .from(users)
      .where(eq(users.id, input.driverUserId))
      .limit(1);
    const drv = rows[0];
    if (!drv || drv.role !== "driver" || !drv.active) {
      throw new PermissionError("السائق المحدد غير نشط أو غير موجود.");
    }
    if (drv.managerId !== claims.userId) {
      throw new PermissionError(
        "لا يمكنك استلام تسليم من سائق ليس تابعاً لك.",
      );
    }
    return { userId: drv.id, name: drv.name, managerId: drv.managerId };
  }
  throw new PermissionError("تسليم الأموال متاح للسائق والمدير فقط.");
}

export async function performHandover(
  tx: DbTx,
  input: HandoverInput,
  claims: TreasuryClaims,
): Promise<{ movementId: number; custodyBalance: string; managerBoxBalance: string }> {
  assertCanHandover(claims);
  const driver = await resolveHandoverDriver(tx, input, claims);

  if (driver.managerId == null) {
    throw new ConflictError(
      "لا يمكن تنفيذ عملية الصندوق: السائق غير مرتبط بمدير.",
      "CUSTODY_DRIVER_UNLINKED",
      { driverUserId: driver.userId },
    );
  }

  const custodyRef = await findAccountByOwnerAndType(tx, driver.userId, "driver_custody");
  if (!custodyRef) {
    throw new ConflictError(
      "لا توجد عهدة للسائق.",
      "CUSTODY_DRIVER_UNLINKED",
      { driverUserId: driver.userId },
    );
  }
  const boxRef = await findAccountByOwnerAndType(tx, driver.managerId, "manager_box");
  if (!boxRef) {
    throw new ConflictError(
      "لا يوجد صندوق للمدير المقصود.",
      "MANAGER_BOX_MISSING",
      { managerUserId: driver.managerId },
    );
  }

  // Canonical lock order: lower id first.
  const [firstId, secondId] =
    custodyRef.id < boxRef.id
      ? [custodyRef.id, boxRef.id]
      : [boxRef.id, custodyRef.id];
  await lockAccountForUpdate(tx, firstId);
  await lockAccountForUpdate(tx, secondId);

  const custody = await lockAccountForUpdate(tx, custodyRef.id);
  const box = await lockAccountForUpdate(tx, boxRef.id);
  if (!custody || !box) {
    throw new ConflictError(
      "حساب الصندوق غير موجود.",
      "TREASURY_ACCOUNT_MISSING",
    );
  }

  const amount = round2(input.amount);

  // Phase 4.3.2 — defense-in-depth on the service layer. Zod's refine at the
  // DTO rejects sub-cent inputs at the wire; this guard catches any caller
  // that bypasses Zod (internal invocation, future transport). A zero-value
  // movement row must be unreachable in all paths — D-58 append-only + BR-55
  // contracts both assume every movement represents real money.
  if (amount < 0.01) {
    throw new BusinessRuleError(
      "المبلغ يجب أن يكون 0.01€ على الأقل.",
      "VALIDATION_FAILED",
      400,
      "performHandover: rounded amount below 0.01 (sub-cent)",
      { rawAmount: input.amount, roundedAmount: amount },
    );
  }

  const custodyBalance = parseNumeric(custody.balance);
  if (amount > custodyBalance + 0.005) {
    throw new ConflictError(
      "لا يمكن تسليم مبلغ يتجاوز رصيد العهدة.",
      "INSUFFICIENT_CUSTODY",
      {
        amount,
        custodyBalance,
        custodyAccountId: custody.id,
      },
    );
  }

  const newCustody = round2(custodyBalance - amount);
  const newBox = round2(parseNumeric(box.balance) + amount);

  await tx
    .update(treasuryAccounts)
    .set({ balance: newCustody.toFixed(2) })
    .where(eq(treasuryAccounts.id, custody.id));
  await tx
    .update(treasuryAccounts)
    .set({ balance: newBox.toFixed(2) })
    .where(eq(treasuryAccounts.id, box.id));

  const movementInserted = await tx
    .insert(treasuryMovements)
    .values({
      date: parisIsoDate(new Date()),
      category: "driver_handover",
      fromAccountId: custody.id,
      toAccountId: box.id,
      amount: amount.toFixed(2),
      referenceType: "user",
      referenceId: driver.userId,
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning({ id: treasuryMovements.id });

  await logActivity(tx, {
    action: "create",
    entityType: "treasury_movements",
    entityId: movementInserted[0].id,
    userId: claims.userId,
    username: claims.username,
    details: {
      kind: "driver_handover",
      driverUserId: driver.userId,
      managerUserId: driver.managerId,
      amount,
      custodyBalanceAfter: newCustody,
      managerBoxBalanceAfter: newBox,
    },
  });

  // Phase 5.1 — DRIVER_HANDOVER_DONE → manager (line 40 of the matrix).
  // `driver.managerId` is non-null here by BR-55b invariant (the guard above
  // already threw CUSTODY_DRIVER_UNLINKED otherwise).
  await emitNotifications(tx, {
    type: "DRIVER_HANDOVER_DONE",
    movementId: movementInserted[0].id,
    managerUserId: driver.managerId,
    amount: amount.toFixed(2),
  });

  return {
    movementId: movementInserted[0].id,
    custodyBalance: newCustody.toFixed(2),
    managerBoxBalance: newBox.toFixed(2),
  };
}
