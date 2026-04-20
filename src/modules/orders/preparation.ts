import { and, asc, count, inArray, isNull } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { orderItems, orders } from "@/db/schema";
import { orderRowToDto } from "./mappers";
import type { OrderDto } from "./dto";

// GET /api/v1/preparation — read-only list of orders in the prep-queue states.
// Role-gated at the route level (stock_keeper / pm / gm / manager). Returns
// full orders WITH items so the preparation UI can render line-by-line picking.
// Status filter: 'محجوز' (waiting) + 'قيد التحضير' (in progress). 'جاهز' is out
// (belongs to the delivery queue — Phase 4).

const PREP_STATUSES = ["محجوز", "قيد التحضير"] as const;

export async function listPreparationQueue(
  db: DbHandle,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: OrderDto[]; total: number }> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const filter = and(
    isNull(orders.deletedAt),
    inArray(orders.status, PREP_STATUSES as unknown as string[]),
  );

  const [rowsList, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(filter)
      .orderBy(asc(orders.date), asc(orders.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(orders).where(filter),
  ]);

  // Batch-load items for all returned orders.
  const ids = rowsList.map((o) => o.id);
  const itemsByOrder = new Map<number, typeof orderItems.$inferSelect[]>();
  if (ids.length > 0) {
    const allItems = await db
      .select()
      .from(orderItems)
      .where(and(inArray(orderItems.orderId, ids), isNull(orderItems.deletedAt)));
    for (const it of allItems) {
      const bucket = itemsByOrder.get(it.orderId) ?? [];
      bucket.push(it);
      itemsByOrder.set(it.orderId, bucket);
    }
  }

  return {
    rows: rowsList.map((r) => orderRowToDto(r, itemsByOrder.get(r.id) ?? [])),
    total: Number(total),
  };
}
