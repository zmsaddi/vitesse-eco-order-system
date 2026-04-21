import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { treasuryAccounts, treasuryMovements, users } from "@/db/schema";
import { PermissionError } from "@/lib/api-errors";
import {
  treasuryAccountRowToDto,
  treasuryMovementRowToDto,
} from "./mappers";
import type { ListTreasuryQuery, TreasurySnapshotDto } from "./dto";
import {
  assertCanViewTreasury,
  type TreasuryClaims,
} from "./permissions";

// Phase 4.2 — treasury read service.
//
// Write paths live in their own files to keep the 300-line rule:
//   - performHandover  → ./handover.ts
//   - bridgeCollection → ./bridge.ts
//
// Role-based visibility (16_Data_Visibility §treasury):
//   pm/gm      : all accounts + all movements.
//   manager    : own manager_box + driver_custodies of drivers with
//                manager_id = self.userId. Movements that touch any of those.
//   driver     : own driver_custody + movements that touch it.
//   seller/stock_keeper : 403 at route gate.

type AccountIdVisibility =
  | { scope: "all"; ids: [] }
  | { scope: "ids"; ids: number[] };

async function visibleAccountIdsForClaims(
  db: DbHandle,
  claims: TreasuryClaims,
): Promise<AccountIdVisibility> {
  if (claims.role === "pm" || claims.role === "gm") {
    return { scope: "all", ids: [] };
  }
  if (claims.role === "manager") {
    const teamDrivers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.managerId, claims.userId), eq(users.role, "driver")));
    const teamDriverIds = teamDrivers.map((r) => r.id);
    const rows = await db
      .select({ id: treasuryAccounts.id })
      .from(treasuryAccounts)
      .where(
        or(
          and(
            eq(treasuryAccounts.ownerUserId, claims.userId),
            eq(treasuryAccounts.type, "manager_box"),
          ),
          teamDriverIds.length > 0
            ? and(
                eq(treasuryAccounts.type, "driver_custody"),
                inArray(treasuryAccounts.ownerUserId, teamDriverIds),
              )
            : sql`false`,
        ),
      );
    return { scope: "ids", ids: rows.map((r) => r.id) };
  }
  if (claims.role === "driver") {
    const rows = await db
      .select({ id: treasuryAccounts.id })
      .from(treasuryAccounts)
      .where(
        and(
          eq(treasuryAccounts.ownerUserId, claims.userId),
          eq(treasuryAccounts.type, "driver_custody"),
        ),
      );
    return { scope: "ids", ids: rows.map((r) => r.id) };
  }
  throw new PermissionError("الصندوق غير متاح لدورك.");
}

export async function listTreasury(
  db: DbHandle,
  claims: TreasuryClaims,
  q: ListTreasuryQuery,
): Promise<TreasurySnapshotDto> {
  assertCanViewTreasury(claims);
  const visibility = await visibleAccountIdsForClaims(db, claims);

  const accountRows =
    visibility.scope === "all"
      ? await db.select().from(treasuryAccounts)
      : visibility.ids.length === 0
        ? []
        : await db
            .select()
            .from(treasuryAccounts)
            .where(inArray(treasuryAccounts.id, visibility.ids));

  const movementFilter =
    visibility.scope === "all"
      ? undefined
      : visibility.ids.length === 0
        ? sql`false`
        : or(
            inArray(treasuryMovements.fromAccountId, visibility.ids),
            inArray(treasuryMovements.toAccountId, visibility.ids),
          );

  const movementRows = await db
    .select()
    .from(treasuryMovements)
    .where(movementFilter)
    .orderBy(desc(treasuryMovements.id))
    .limit(q.movementsLimit)
    .offset(q.movementsOffset);

  const countRes = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(treasuryMovements)
    .where(movementFilter);
  const movementsTotal = countRes[0]?.c ?? 0;

  return {
    accounts: accountRows.map(treasuryAccountRowToDto),
    movements: movementRows.map(treasuryMovementRowToDto),
    movementsTotal,
  };
}

// Re-exports so route handlers + confirm.ts import a single module path.
export { performHandover } from "./handover";
export { bridgeCollection, type BridgeCollectionArgs } from "./bridge";
export type { TreasuryClaims } from "./permissions";
