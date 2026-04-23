import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { deliveries, orders, products } from "@/db/schema";
import { todayParisIso } from "@/lib/paris-date";
import type { TeamFilter } from "./kpi-helpers";

// Phase 5.3 — dashboard counts module. "counts" section of the response.
// Takes ISO date strings for the period (already computed upstream).

export async function loadCounts(
  db: DbHandle,
  fromIso: string,
  toExclusiveIso: string,
  teamFilter: TeamFilter | null,
): Promise<{
  ordersToday: number;
  deliveriesPending: number;
  lowStockCount: number;
  openCancellations: number;
}> {
  const today = todayParisIso();

  const ordersFilters = [
    eq(orders.date, today),
    sql`${orders.deletedAt} IS NULL`,
  ];
  if (teamFilter) {
    ordersFilters.push(
      inArray(
        orders.createdBy,
        teamFilter.usernames.length > 0 ? teamFilter.usernames : [""],
      ),
    );
  }
  const ordersTodayRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(orders)
    .where(and(...ordersFilters));

  const delFilters = [
    eq(deliveries.status, "قيد الانتظار"),
    sql`${deliveries.deletedAt} IS NULL`,
  ];
  if (teamFilter) {
    delFilters.push(
      inArray(
        deliveries.assignedDriverId,
        teamFilter.userIds.length > 0 ? teamFilter.userIds : [-1],
      ),
    );
  }
  const deliveriesPendingRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(deliveries)
    .where(and(...delFilters));

  const lowStockRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(products)
    .where(
      and(
        eq(products.active, true),
        sql`${products.stock} < ${products.lowStockThreshold}`,
      ),
    );

  const openCancelFilters = [
    eq(orders.status, "ملغي"),
    gte(orders.date, fromIso),
    lt(orders.date, toExclusiveIso),
  ];
  if (teamFilter) {
    openCancelFilters.push(
      inArray(
        orders.createdBy,
        teamFilter.usernames.length > 0 ? teamFilter.usernames : [""],
      ),
    );
  }
  const openCancelRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(orders)
    .where(and(...openCancelFilters));

  return {
    ordersToday: Number(ordersTodayRes[0]?.n ?? 0),
    deliveriesPending: Number(deliveriesPendingRes[0]?.n ?? 0),
    lowStockCount: Number(lowStockRes[0]?.n ?? 0),
    openCancellations: Number(openCancelRes[0]?.n ?? 0),
  };
}
