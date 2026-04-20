import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { driverTasks } from "@/db/schema";
import { driverTaskRowToDto } from "./mappers";
import type { DriverTaskDto } from "./dto";

// Driver-scoped task listing. By default filters to active states
// (pending + in_progress) — completed tasks stay queryable via
// ?includeCompleted=1 for audit screens.

export type ListTasksOptions = {
  includeCompleted?: boolean;
  limit?: number;
  offset?: number;
};

const ACTIVE_STATUSES = ["pending", "in_progress"] as const;

export async function listTasksForDriver(
  db: DbHandle,
  driverUserId: number,
  opts: ListTasksOptions = {},
): Promise<{ rows: DriverTaskDto[]; total: number }> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const filter = opts.includeCompleted
    ? eq(driverTasks.assignedDriverId, driverUserId)
    : and(
        eq(driverTasks.assignedDriverId, driverUserId),
        inArray(driverTasks.status, ACTIVE_STATUSES as unknown as string[]),
      );

  const rowsList = await db
    .select()
    .from(driverTasks)
    .where(filter)
    .orderBy(asc(driverTasks.createdAt))
    .limit(limit)
    .offset(offset);
  // Total (same filter) — cheap, small table expected.
  const totalResult = await db.select({ id: driverTasks.id }).from(driverTasks).where(filter);
  return {
    rows: rowsList.map(driverTaskRowToDto),
    total: totalResult.length,
  };
}
