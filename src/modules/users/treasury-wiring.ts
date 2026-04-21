import { and, eq } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { treasuryAccounts, users } from "@/db/schema";
import { BusinessRuleError } from "@/lib/api-errors";

// Phase 4.2 — idempotent wiring between users and their treasury accounts.
//
// Invariants enforced here:
//   - Creating a role='manager' user ⇒ auto-create its manager_box IF absent.
//   - Creating a role='driver' user with managerId ⇒ auto-create its
//     driver_custody under the manager's manager_box IF absent.
//   - Changing a driver's managerId ⇒ rebind driver_custody.parent_account_id
//     to the new manager_box. Never create a second custody.
//   - Disabling a user or changing its role ⇒ no-op on treasury_accounts.
//     Accounts are never deleted; new operations are gated by role/active
//     checks elsewhere (service-layer rules on bridge + handover).

type ManagerValidation = { id: number; role: string; active: boolean };

async function loadManager(tx: DbTx, managerId: number): Promise<ManagerValidation | null> {
  const rows = await tx
    .select({ id: users.id, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, managerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function validateManagerLink(
  tx: DbTx,
  managerId: number,
): Promise<void> {
  const mgr = await loadManager(tx, managerId);
  if (!mgr || mgr.role !== "manager" || !mgr.active) {
    throw new BusinessRuleError(
      "المستخدم المحدد ليس مديراً نشطاً.",
      "INVALID_MANAGER",
      400,
      `manager_id=${managerId} is not an active role='manager' user`,
      { managerId },
    );
  }
}

export async function findManagerBox(
  tx: DbTx,
  managerUserId: number,
): Promise<{ id: number } | null> {
  const rows = await tx
    .select({ id: treasuryAccounts.id })
    .from(treasuryAccounts)
    .where(
      and(
        eq(treasuryAccounts.ownerUserId, managerUserId),
        eq(treasuryAccounts.type, "manager_box"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureManagerBox(
  tx: DbTx,
  managerUserId: number,
  managerName: string,
): Promise<number> {
  const existing = await findManagerBox(tx, managerUserId);
  if (existing) return existing.id;
  const inserted = await tx
    .insert(treasuryAccounts)
    .values({
      type: "manager_box",
      name: `صندوق ${managerName}`,
      ownerUserId: managerUserId,
      parentAccountId: null,
      balance: "0",
      active: 1,
    })
    .returning({ id: treasuryAccounts.id });
  return inserted[0].id;
}

async function findDriverCustody(
  tx: DbTx,
  driverUserId: number,
): Promise<{ id: number; parentAccountId: number | null } | null> {
  const rows = await tx
    .select({
      id: treasuryAccounts.id,
      parentAccountId: treasuryAccounts.parentAccountId,
    })
    .from(treasuryAccounts)
    .where(
      and(
        eq(treasuryAccounts.ownerUserId, driverUserId),
        eq(treasuryAccounts.type, "driver_custody"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Ensure a driver_custody exists and is parented to the correct manager_box.
 *
 * - If custody does not exist, create it under the given manager_box.
 * - If custody exists but its parent_account_id differs, rebind.
 *   (Second call with the same parent is a no-op — idempotent.)
 * - Never creates a duplicate custody for the same owner_user_id.
 *
 * Pre-condition: the manager_box for `managerUserId` must already exist (caller
 * invokes `ensureManagerBox` for the manager first).
 */
export async function ensureDriverCustody(
  tx: DbTx,
  driverUserId: number,
  driverName: string,
  managerUserId: number,
): Promise<number> {
  const managerBox = await findManagerBox(tx, managerUserId);
  if (!managerBox) {
    throw new BusinessRuleError(
      "لا يمكن ربط السائق: صندوق المدير غير موجود.",
      "MANAGER_BOX_MISSING",
      500,
      `manager_box for manager_user_id=${managerUserId} is missing`,
      { managerUserId },
    );
  }

  const existing = await findDriverCustody(tx, driverUserId);
  if (existing) {
    if (existing.parentAccountId !== managerBox.id) {
      await tx
        .update(treasuryAccounts)
        .set({ parentAccountId: managerBox.id })
        .where(eq(treasuryAccounts.id, existing.id));
    }
    return existing.id;
  }

  const inserted = await tx
    .insert(treasuryAccounts)
    .values({
      type: "driver_custody",
      name: `عهدة ${driverName}`,
      ownerUserId: driverUserId,
      parentAccountId: managerBox.id,
      balance: "0",
      active: 1,
    })
    .returning({ id: treasuryAccounts.id });
  return inserted[0].id;
}
