import { and, eq, isNull } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { orderItems, orders } from "@/db/schema";
import { NotFoundError } from "@/lib/api-errors";
import { orderRowToDto } from "./mappers";
import { enforceOrderVisibility, type OrderClaims } from "./permissions";
import type { OrderDto } from "./dto";

// Phase 5.1 — orders read-path helpers extracted so service.ts stays under
// the 300-line cap. Both functions return the same DTO shape; the split is
// purely a permission concern (external GET runs the role-based visibility
// check; internal echoes after a permission-gated mutation do not).

export async function getOrderById(
  db: DbHandle,
  id: number,
  claims: OrderClaims,
): Promise<OrderDto> {
  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)))
    .limit(1);
  if (orderRows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);

  enforceOrderVisibility(orderRows[0], claims);

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)));

  return orderRowToDto(orderRows[0], items);
}

/**
 * Internal read used by mutation echoes (post-create/transition/cancel). The
 * role-based visibility check applies to external GET requests; once the caller
 * has already passed their mutation's permission gate, echoing the row back is
 * safe even if their role wouldn't satisfy the broader GET visibility rules
 * (e.g. stock_keeper completing a state transition).
 */
export async function fetchOrderInternal(
  db: DbHandle | DbTx,
  id: number,
): Promise<OrderDto> {
  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)))
    .limit(1);
  if (orderRows.length === 0) throw new NotFoundError(`الطلب رقم ${id}`);
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)));
  return orderRowToDto(orderRows[0], items);
}
