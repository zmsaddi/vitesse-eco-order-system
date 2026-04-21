import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { bonuses, settlements } from "@/db/schema";
import { round2 } from "@/lib/money";
import type {
  BonusesSummaryDto,
  ListBonusesQuery,
  ListSettlementsQuery,
} from "./dto";
import { bonusRowToDto, settlementRowToDto } from "./mappers";
import { readUnappliedDebtTotal } from "./credit";
import {
  assertCanListBonuses,
  assertCanListSettlements,
  resolveBonusesQueryOwner,
  type SettlementClaims,
} from "./permissions";

// Phase 4.4 — read-side handlers extracted so `service.ts` stays under the
// 300-line cap. Both functions accept a DbHandle OR DbTx so they work from
// `withRead` (GET endpoints) without forcing a transaction.

export async function listSettlements(
  db: DbHandle | DbTx,
  query: ListSettlementsQuery,
  claims: SettlementClaims,
): Promise<{ items: ReturnType<typeof settlementRowToDto>[]; total: number }> {
  assertCanListSettlements(claims);

  const filters = [isNull(settlements.deletedAt)];
  if (query.userId !== undefined) filters.push(eq(settlements.userId, query.userId));
  if (query.role !== undefined) filters.push(eq(settlements.role, query.role));
  if (query.type !== undefined) filters.push(eq(settlements.type, query.type));
  const where = and(...filters);

  const rows = await db
    .select()
    .from(settlements)
    .where(where)
    .orderBy(desc(settlements.id))
    .limit(query.limit)
    .offset(query.offset);

  const totalRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(settlements)
    .where(where);
  const total = Number(totalRes[0]?.n ?? 0);

  return {
    items: rows.map((r) => settlementRowToDto(r)),
    total,
  };
}

export async function listBonuses(
  db: DbHandle | DbTx,
  query: ListBonusesQuery,
  claims: SettlementClaims,
): Promise<{
  items: ReturnType<typeof bonusRowToDto>[];
  summary: BonusesSummaryDto;
}> {
  assertCanListBonuses(claims);
  const ownerUserId = resolveBonusesQueryOwner(claims, query.userId);

  const filters = [isNull(bonuses.deletedAt)];
  if (ownerUserId !== undefined) filters.push(eq(bonuses.userId, ownerUserId));
  if (query.status !== undefined) filters.push(eq(bonuses.status, query.status));
  const where = and(...filters);

  const rows = await db
    .select()
    .from(bonuses)
    .where(where)
    .orderBy(asc(bonuses.id))
    .limit(query.limit)
    .offset(query.offset);

  // Summary aggregates over the SAME user scope but ignores the status filter
  // (summary cards always show all four status buckets).
  const summary = await computeBonusesSummary(db, ownerUserId);

  return {
    items: rows.map((r) => bonusRowToDto(r)),
    summary,
  };
}

async function computeBonusesSummary(
  db: DbHandle | DbTx,
  ownerUserId: number | undefined,
): Promise<BonusesSummaryDto> {
  const ownerFilter =
    ownerUserId === undefined ? sql`` : sql`AND user_id = ${ownerUserId}`;
  const res = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'unpaid'   THEN total_bonus ELSE 0 END), 0)::numeric AS unpaid_total,
      COALESCE(SUM(CASE WHEN status = 'retained' THEN total_bonus ELSE 0 END), 0)::numeric AS retained_total,
      COALESCE(SUM(CASE WHEN status = 'settled'  THEN total_bonus ELSE 0 END), 0)::numeric AS settled_total
    FROM bonuses
    WHERE deleted_at IS NULL
    ${ownerFilter}
  `);
  const r =
    (res as unknown as {
      rows?: Array<{
        unpaid_total: string;
        retained_total: string;
        settled_total: string;
      }>;
    }).rows?.[0] ?? {
      unpaid_total: "0",
      retained_total: "0",
      settled_total: "0",
    };

  const unpaidTotal = round2(Number(r.unpaid_total));
  const retainedTotal = round2(Number(r.retained_total));
  const settledTotal = round2(Number(r.settled_total));
  const debtTotal = await readUnappliedDebtTotal(db, ownerUserId);
  const debtOutstanding = round2(Math.abs(debtTotal));
  const availableCredit = round2(unpaidTotal + debtTotal); // debtTotal <= 0

  return {
    unpaidTotal: unpaidTotal.toFixed(2),
    retainedTotal: retainedTotal.toFixed(2),
    settledTotal: settledTotal.toFixed(2),
    debtOutstanding: debtOutstanding.toFixed(2),
    availableCredit: availableCredit.toFixed(2),
  };
}
