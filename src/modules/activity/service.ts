import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { activityLog, users } from "@/db/schema";
import { activityRowToDto } from "./mappers";
import type { ListActivityQuery, ListActivityResponse } from "./dto";
import {
  assertCanViewActivity,
  type ActivityClaims,
} from "./permissions";

// Phase 5.2 — activity_log read service.
//
// pm / gm   : no visibility filter beyond the user-supplied query filters.
// manager   : restricted to user_id ∈ {claims.userId} ∪ {u.id : u.manager_id = claims.userId}.
//             If the caller-supplied `userId` filter is present and outside
//             the allowed set, we return 0 rows — never 403 — to avoid an
//             oracle that confirms foreign usernames. Same policy treasury
//             uses for manager team-scoping.
// others    : 403 at assertCanViewActivity (route layer redundancy).

async function visibleUserIdsForManager(
  db: DbHandle,
  managerUserId: number,
): Promise<number[]> {
  const teamDrivers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.managerId, managerUserId), eq(users.role, "driver")));
  return [managerUserId, ...teamDrivers.map((r) => r.id)];
}

// Europe/Paris half-open window for a date filter. dateFrom is inclusive at
// 00:00 local; dateTo is inclusive by day, implemented as exclusive at
// (dateTo + 1 day) 00:00 local. Postgres `timestamptz` compares UTC against
// UTC, so we let the DB do the TZ math via `AT TIME ZONE 'Europe/Paris'`
// through explicit bounds.
function parisDayStart(dateIso: string): string {
  return `${dateIso}T00:00:00+02:00`;
}

function parisDayAfter(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}T00:00:00+02:00`;
}

export async function listActivity(
  db: DbHandle,
  query: ListActivityQuery,
  claims: ActivityClaims,
): Promise<ListActivityResponse> {
  assertCanViewActivity(claims);

  const conditions = [] as ReturnType<typeof eq>[];

  if (claims.role === "manager") {
    const allowed = await visibleUserIdsForManager(db, claims.userId);
    // If a userId filter was provided, intersect with the manager's allowed
    // set. Outside-team userId → empty allowed list → 0 rows via inArray([]).
    const effective =
      query.userId !== undefined
        ? allowed.includes(query.userId)
          ? [query.userId]
          : []
        : allowed;
    if (effective.length === 0) {
      return { items: [], total: 0, limit: query.limit, offset: query.offset };
    }
    conditions.push(inArray(activityLog.userId, effective));
  } else if (query.userId !== undefined) {
    conditions.push(eq(activityLog.userId, query.userId));
  }

  if (query.entityType !== undefined) {
    conditions.push(eq(activityLog.entityType, query.entityType));
  }
  if (query.action !== undefined) {
    conditions.push(eq(activityLog.action, query.action));
  }
  if (query.dateFrom !== undefined) {
    conditions.push(gte(activityLog.timestamp, new Date(parisDayStart(query.dateFrom))));
  }
  if (query.dateTo !== undefined) {
    conditions.push(lt(activityLog.timestamp, new Date(parisDayAfter(query.dateTo))));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(activityLog)
    .where(where)
    .orderBy(desc(activityLog.id))
    .limit(query.limit)
    .offset(query.offset);

  const totalRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(activityLog)
    .where(where);
  const total = Number(totalRes[0]?.n ?? 0);

  return {
    items: rows.map(activityRowToDto),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}
