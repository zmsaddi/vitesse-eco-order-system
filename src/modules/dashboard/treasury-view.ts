import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { treasuryAccounts, users } from "@/db/schema";
import type { DashboardClaims } from "./permissions";
import type { TreasuryBalanceDto } from "./dto";

// Phase 5.3 — dashboard treasury-balances view. Role-scoped:
//   pm/gm  → all active accounts.
//   manager → own manager_box + driver_custody of drivers with manager_id = self.

export async function loadTreasuryBalances(
  db: DbHandle,
  claims: DashboardClaims,
): Promise<TreasuryBalanceDto[]> {
  if (claims.role === "pm" || claims.role === "gm") {
    return db
      .select({
        accountId: treasuryAccounts.id,
        name: treasuryAccounts.name,
        type: treasuryAccounts.type,
        balance: treasuryAccounts.balance,
      })
      .from(treasuryAccounts)
      .where(eq(treasuryAccounts.active, 1));
  }

  const linked = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.managerId, claims.userId), eq(users.role, "driver")));
  const driverIds = linked.map((r) => r.id);

  return db
    .select({
      accountId: treasuryAccounts.id,
      name: treasuryAccounts.name,
      type: treasuryAccounts.type,
      balance: treasuryAccounts.balance,
    })
    .from(treasuryAccounts)
    .where(
      and(
        eq(treasuryAccounts.active, 1),
        or(
          and(
            eq(treasuryAccounts.ownerUserId, claims.userId),
            eq(treasuryAccounts.type, "manager_box"),
          ),
          driverIds.length > 0
            ? and(
                eq(treasuryAccounts.type, "driver_custody"),
                inArray(treasuryAccounts.ownerUserId, driverIds),
              )
            : sql`false`,
        ),
      ),
    );
}
