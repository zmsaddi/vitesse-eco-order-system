import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import {
  bonuses,
  clients,
  orderItems,
  orders,
  payments,
  products,
} from "@/db/schema";
import { parisDayAfter, parisDayStart, parisNextDayIso } from "@/lib/paris-date";
import type {
  BonusesByUserReport,
  RevenueByDayReport,
  TopClientsByDebtReport,
  TopProductsByRevenueReport,
} from "./dto";

// Phase 5.3 — ranking + timeseries report runners.

export type TeamFilter = {
  userIds: number[];
  usernames: string[];
};

function round2(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

export async function runRevenueByDay(
  db: DbHandle,
  fromIso: string,
  toIso: string,
  teamFilter: TeamFilter | null,
): Promise<RevenueByDayReport> {
  const toExclusiveIso = parisNextDayIso(toIso);
  const filters = [
    gte(payments.date, fromIso),
    lt(payments.date, toExclusiveIso),
    sql`${payments.deletedAt} IS NULL`,
    inArray(payments.type, ["collection", "refund", "advance"]),
  ];
  if (teamFilter) {
    filters.push(
      sql`${payments.orderId} IN (
        SELECT ${orders.id} FROM ${orders}
        WHERE ${orders.createdBy} IN (${sql.join(
          teamFilter.usernames.map((u) => sql`${u}`),
          sql`, `,
        )})
      )`,
    );
  }
  const rows = await db
    .select({
      date: payments.date,
      revenue: sql<string>`COALESCE(SUM(${payments.amount}),0)::text`,
    })
    .from(payments)
    .where(and(...filters))
    .groupBy(payments.date)
    .orderBy(payments.date);
  return {
    slug: "revenue-by-day",
    period: { from: fromIso, to: toIso },
    series: rows.map((r) => ({
      date: r.date,
      revenue: round2(Number(r.revenue)),
    })),
  };
}

export async function runTopClientsByDebt(
  db: DbHandle,
): Promise<TopClientsByDebtReport> {
  // Live snapshot — not date-filtered. Debt is "total outstanding now."
  const res = await db.execute<{
    client_id: number;
    client_name: string;
    total_remaining: string;
  }>(sql`
    SELECT c.id AS client_id, c.name AS client_name,
           SUM(
             ${orders.totalAmount} - COALESCE((
               SELECT SUM(${payments.amount}) FROM ${payments}
               WHERE ${payments.orderId} = ${orders.id}
                 AND ${payments.type} IN ('collection','refund','advance')
                 AND ${payments.deletedAt} IS NULL
             ), 0)
           )::text AS total_remaining
    FROM ${orders}
    JOIN ${clients} c ON c.id = ${orders.clientId}
    WHERE ${orders.status} != 'ملغي'
      AND ${orders.deletedAt} IS NULL
      AND (${orders.totalAmount} - COALESCE((
        SELECT SUM(${payments.amount}) FROM ${payments}
        WHERE ${payments.orderId} = ${orders.id}
          AND ${payments.type} IN ('collection','refund','advance')
          AND ${payments.deletedAt} IS NULL
      ), 0)) > 0.01
    GROUP BY c.id, c.name
    ORDER BY total_remaining DESC
    LIMIT 20
  `);
  const rows =
    (res as unknown as {
      rows?: Array<{
        client_id: number;
        client_name: string;
        total_remaining: string;
      }>;
    }).rows ?? [];
  return {
    slug: "top-clients-by-debt",
    period: { from: "", to: "" },
    rows: rows.map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name,
      totalRemaining: round2(Number(r.total_remaining)),
    })),
  };
}

export async function runTopProducts(
  db: DbHandle,
  fromIso: string,
  toIso: string,
): Promise<TopProductsByRevenueReport> {
  const fromDate = parisDayStart(fromIso);
  const toDate = parisDayAfter(toIso);
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      revenue: sql<string>`COALESCE(SUM(${orderItems.lineTotal}),0)::text`,
      qty: sql<string>`COALESCE(SUM(${orderItems.quantity}),0)::text`,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "مؤكد"),
        gte(orders.confirmationDate, fromDate),
        lt(orders.confirmationDate, toDate),
        eq(orderItems.isGift, false),
        sql`${orderItems.deletedAt} IS NULL`,
        sql`${orders.deletedAt} IS NULL`,
      ),
    )
    .groupBy(products.id, products.name)
    .orderBy(desc(sql`COALESCE(SUM(${orderItems.lineTotal}),0)`))
    .limit(20);
  return {
    slug: "top-products-by-revenue",
    period: { from: fromIso, to: toIso },
    rows: rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      revenue: round2(Number(r.revenue)),
      qty: round2(Number(r.qty)),
    })),
  };
}

export async function runBonusesByUser(
  db: DbHandle,
  fromIso: string,
  toIso: string,
  teamFilter: TeamFilter | null,
): Promise<BonusesByUserReport> {
  const toExclusiveIso = parisNextDayIso(toIso);
  const filters = [
    gte(bonuses.date, fromIso),
    lt(bonuses.date, toExclusiveIso),
    sql`${bonuses.deletedAt} IS NULL`,
  ];
  if (teamFilter) {
    filters.push(
      inArray(
        bonuses.userId,
        teamFilter.userIds.length > 0 ? teamFilter.userIds : [-1],
      ),
    );
  }
  const rows = await db
    .select({
      userId: bonuses.userId,
      username: bonuses.username,
      role: bonuses.role,
      totalBonus: sql<string>`COALESCE(SUM(${bonuses.totalBonus}),0)::text`,
    })
    .from(bonuses)
    .where(and(...filters))
    .groupBy(bonuses.userId, bonuses.username, bonuses.role)
    .orderBy(desc(sql`COALESCE(SUM(${bonuses.totalBonus}),0)`));
  return {
    slug: "bonuses-by-user",
    period: { from: fromIso, to: toIso },
    rows: rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      role: r.role,
      totalBonus: round2(Number(r.totalBonus)),
    })),
  };
}
