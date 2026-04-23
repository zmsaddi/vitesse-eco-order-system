import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import {
  bonuses,
  expenses,
  orderItems,
  orders,
  payments,
  settlements,
} from "@/db/schema";

// Phase 5.3 — dashboard KPI aggregation helpers.
// Each returns a COALESCEd text numeric; caller does `.toFixed(2)`.

export type TeamFilter = {
  userIds: number[];
  usernames: string[];
};

export async function sumRevenue(
  db: DbHandle,
  fromIso: string,
  toExclusiveIso: string,
  teamFilter: TeamFilter | null,
): Promise<string> {
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
  const res = await db
    .select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)::text` })
    .from(payments)
    .where(and(...filters));
  return res[0]?.s ?? "0";
}

export async function sumCogs(
  db: DbHandle,
  fromDate: Date,
  toDate: Date,
): Promise<string> {
  const res = await db
    .select({
      s: sql<string>`COALESCE(SUM(${orderItems.costPrice} * ${orderItems.quantity}),0)::text`,
    })
    .from(orderItems)
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
    );
  return res[0]?.s ?? "0";
}

export async function sumGiftCost(
  db: DbHandle,
  fromDate: Date,
  toDate: Date,
): Promise<string> {
  const res = await db
    .select({
      s: sql<string>`COALESCE(SUM(${orderItems.costPrice} * ${orderItems.quantity}),0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "مؤكد"),
        gte(orders.confirmationDate, fromDate),
        lt(orders.confirmationDate, toDate),
        eq(orderItems.isGift, true),
        sql`${orderItems.deletedAt} IS NULL`,
        sql`${orders.deletedAt} IS NULL`,
      ),
    );
  return res[0]?.s ?? "0";
}

export async function sumExpenses(
  db: DbHandle,
  fromIso: string,
  toExclusiveIso: string,
): Promise<string> {
  const res = await db
    .select({ s: sql<string>`COALESCE(SUM(${expenses.amount}),0)::text` })
    .from(expenses)
    .where(
      and(
        gte(expenses.date, fromIso),
        lt(expenses.date, toExclusiveIso),
        sql`${expenses.deletedAt} IS NULL`,
      ),
    );
  return res[0]?.s ?? "0";
}

export async function sumBonuses(
  db: DbHandle,
  fromIso: string,
  toExclusiveIso: string,
): Promise<string> {
  const res = await db
    .select({ s: sql<string>`COALESCE(SUM(${bonuses.totalBonus}),0)::text` })
    .from(bonuses)
    .where(
      and(
        gte(bonuses.date, fromIso),
        lt(bonuses.date, toExclusiveIso),
        sql`${bonuses.deletedAt} IS NULL`,
      ),
    );
  return res[0]?.s ?? "0";
}

export async function sumRewards(
  db: DbHandle,
  fromIso: string,
  toExclusiveIso: string,
): Promise<string> {
  const res = await db
    .select({ s: sql<string>`COALESCE(SUM(${settlements.amount}),0)::text` })
    .from(settlements)
    .where(
      and(
        eq(settlements.type, "reward"),
        gte(settlements.date, fromIso),
        lt(settlements.date, toExclusiveIso),
        sql`${settlements.deletedAt} IS NULL`,
      ),
    );
  return res[0]?.s ?? "0";
}

export async function sumOutstandingDebts(
  db: DbHandle,
  teamFilter: TeamFilter | null,
): Promise<string> {
  const filters = [
    sql`${orders.status} != 'ملغي'`,
    sql`${orders.deletedAt} IS NULL`,
  ];
  if (teamFilter) {
    filters.push(
      inArray(
        orders.createdBy,
        teamFilter.usernames.length > 0 ? teamFilter.usernames : [""],
      ),
    );
  }
  const remainingExpr = sql`(${orders.totalAmount} - COALESCE((
    SELECT SUM(${payments.amount}) FROM ${payments}
    WHERE ${payments.orderId} = ${orders.id}
      AND ${payments.type} IN ('collection','refund','advance')
      AND ${payments.deletedAt} IS NULL
  ), 0))`;
  const res = await db
    .select({
      s: sql<string>`COALESCE(SUM(${remainingExpr}),0)::text`,
    })
    .from(orders)
    .where(and(...filters, sql`${remainingExpr} > 0.01`));
  return res[0]?.s ?? "0";
}
