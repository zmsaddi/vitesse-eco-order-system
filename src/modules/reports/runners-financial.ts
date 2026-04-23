import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import {
  bonuses,
  expenses,
  orderItems,
  orders,
  payments,
  settlements,
} from "@/db/schema";
import { parisDayAfter, parisDayStart, parisNextDayIso } from "@/lib/paris-date";
import type {
  ExpensesByCategoryReport,
  PnlReport,
} from "./dto";

// Phase 5.3 — financial report runners: pnl + expenses-by-category.

function round2(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

export async function runPnl(
  db: DbHandle,
  fromIso: string,
  toIso: string,
): Promise<PnlReport> {
  const fromDate = parisDayStart(fromIso);
  const toDate = parisDayAfter(toIso);
  const toExclusiveIso = parisNextDayIso(toIso);

  const revRes = await db
    .select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)::text` })
    .from(payments)
    .where(
      and(
        gte(payments.date, fromIso),
        lt(payments.date, toExclusiveIso),
        sql`${payments.deletedAt} IS NULL`,
        inArray(payments.type, ["collection", "refund", "advance"]),
      ),
    );
  const revenue = revRes[0]?.s ?? "0";

  const cogsRes = await db
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
  const cogs = cogsRes[0]?.s ?? "0";

  const giftRes = await db
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
  const giftCost = giftRes[0]?.s ?? "0";

  const expRes = await db
    .select({ s: sql<string>`COALESCE(SUM(${expenses.amount}),0)::text` })
    .from(expenses)
    .where(
      and(
        gte(expenses.date, fromIso),
        lt(expenses.date, toExclusiveIso),
        sql`${expenses.deletedAt} IS NULL`,
      ),
    );
  const expensesSum = expRes[0]?.s ?? "0";

  const bonRes = await db
    .select({ s: sql<string>`COALESCE(SUM(${bonuses.totalBonus}),0)::text` })
    .from(bonuses)
    .where(
      and(
        gte(bonuses.date, fromIso),
        lt(bonuses.date, toExclusiveIso),
        sql`${bonuses.deletedAt} IS NULL`,
      ),
    );
  const earnedBonuses = bonRes[0]?.s ?? "0";

  const rwdRes = await db
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
  const rewards = rwdRes[0]?.s ?? "0";

  const net =
    Number(revenue) -
    Number(cogs) -
    Number(expensesSum) -
    Number(earnedBonuses) -
    Number(giftCost) -
    Number(rewards);

  return {
    slug: "pnl",
    period: { from: fromIso, to: toIso },
    revenue: round2(Number(revenue)),
    cogs: round2(Number(cogs)),
    expenses: round2(Number(expensesSum)),
    earnedBonuses: round2(Number(earnedBonuses)),
    giftCost: round2(Number(giftCost)),
    rewards: round2(Number(rewards)),
    netProfit: round2(net),
  };
}

export async function runExpensesByCategory(
  db: DbHandle,
  fromIso: string,
  toIso: string,
): Promise<ExpensesByCategoryReport> {
  const toExclusiveIso = parisNextDayIso(toIso);
  const rows = await db
    .select({
      category: expenses.category,
      total: sql<string>`COALESCE(SUM(${expenses.amount}),0)::text`,
    })
    .from(expenses)
    .where(
      and(
        gte(expenses.date, fromIso),
        lt(expenses.date, toExclusiveIso),
        sql`${expenses.deletedAt} IS NULL`,
      ),
    )
    .groupBy(expenses.category)
    .orderBy(desc(sql`COALESCE(SUM(${expenses.amount}),0)`));
  return {
    slug: "expenses-by-category",
    period: { from: fromIso, to: toIso },
    rows: rows.map((r) => ({
      category: r.category,
      total: round2(Number(r.total)),
    })),
  };
}
