import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import { deliveries } from "@/db/schema";
import { PermissionError } from "@/lib/api-errors";
import { deliveryRowToDto } from "./mappers";
import { listDeliveriesForDriver } from "./service";
import type { DeliveryClaims } from "./permissions";
import type { DeliveryDto, ListDeliveriesQuery } from "./dto";

// Phase 6.4 — Role-scoped list used by GET /api/v1/deliveries + /deliveries.
// Scope mirrors Phase 4.0 enforceDeliveryVisibility (pm/gm/manager=all;
// driver=self via listDeliveriesForDriver; seller/stock_keeper=403).
// Extracted from service.ts to respect the project's 300-line-per-file cap —
// same split pattern used by confirm.ts, assign.ts, bonuses.ts in the module.
// Admin branch ordering: (date DESC, id DESC). Driver branch unchanged.

export async function listDeliveries(
  db: DbHandle,
  claims: DeliveryClaims,
  query: ListDeliveriesQuery,
): Promise<{ rows: DeliveryDto[]; total: number }> {
  if (claims.role === "seller") {
    throw new PermissionError(
      "رؤية البائع للتوصيلات تمر عبر طلباته (متوفرة في مرحلة لاحقة).",
    );
  }
  if (claims.role === "stock_keeper") {
    throw new PermissionError("التوصيلات غير مرئية للـ stock_keeper.");
  }

  if (claims.role === "driver") {
    return listDeliveriesForDriver(db, claims.userId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  // pm / gm / manager — all deliveries, caller-supplied filters verbatim.
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const offset = Math.max(0, query.offset ?? 0);

  const conditions = [isNull(deliveries.deletedAt)];
  if (query.status) conditions.push(eq(deliveries.status, query.status));
  if (query.dateFrom) conditions.push(gte(deliveries.date, query.dateFrom));
  if (query.dateTo) conditions.push(lte(deliveries.date, query.dateTo));
  if (query.assignedDriverId !== undefined) {
    conditions.push(eq(deliveries.assignedDriverId, query.assignedDriverId));
  }
  const filter = and(...conditions);

  const rowsList = await db
    .select()
    .from(deliveries)
    .where(filter)
    .orderBy(desc(deliveries.date), desc(deliveries.id))
    .limit(limit)
    .offset(offset);

  const countRes = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(deliveries)
    .where(filter);
  const total = countRes[0]?.c ?? 0;

  return { rows: rowsList.map(deliveryRowToDto), total };
}
