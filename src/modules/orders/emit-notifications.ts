import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { emitNotifications } from "@/modules/notifications/events";

// Phase 5.1 — notification emitters for the orders service extracted as a
// thin helper file so `service.ts` stays under the 300-line cap. Each
// helper takes the tx + the minimal context to resolve the ref code and
// downstream audience (no business logic — pure fan-out).

async function fetchOrderRefCode(
  tx: DbTx,
  orderId: number,
): Promise<string> {
  const res = await tx.execute(
    sql`SELECT ref_code FROM orders WHERE id = ${orderId} LIMIT 1`,
  );
  const rows = (res as unknown as { rows?: Array<{ ref_code: string }> }).rows ?? [];
  return rows[0]?.ref_code ?? `ORD-${orderId}`;
}

async function fetchLinkedDriverId(
  tx: DbTx,
  orderId: number,
): Promise<number | null> {
  const res = await tx.execute(
    sql`SELECT assigned_driver_id FROM deliveries
        WHERE order_id = ${orderId} AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1`,
  );
  const rows =
    (res as unknown as {
      rows?: Array<{ assigned_driver_id: number | null }>;
    }).rows ?? [];
  return rows[0]?.assigned_driver_id ?? null;
}

/**
 * ORDER_CREATED fan-out — pm, gm, manager, stock_keeper (26_Notifications.md line 30).
 * The ref code is already known by the caller since it was just generated.
 */
export async function emitOrderCreated(
  tx: DbTx,
  orderId: number,
  refCode: string,
): Promise<void> {
  await emitNotifications(tx, {
    type: "ORDER_CREATED",
    orderId,
    orderRefCode: refCode,
  });
}

/**
 * ORDER_STARTED_PREPARATION fan-out — stock_keeper only (line 31).
 */
export async function emitOrderStartedPreparation(
  tx: DbTx,
  orderId: number,
): Promise<void> {
  const refCode = await fetchOrderRefCode(tx, orderId);
  await emitNotifications(tx, {
    type: "ORDER_STARTED_PREPARATION",
    orderId,
    orderRefCode: refCode,
  });
}

/**
 * ORDER_CANCELLED fan-out — pm + gm + order's seller + linked driver if any
 * (line 39). `sellerUsername` comes from the locked order row; linked
 * driver is resolved from the most recent delivery row (no delivery = no
 * driver fan-out, routing layer no-ops).
 */
export async function emitOrderCancelled(
  tx: DbTx,
  orderId: number,
  sellerUsername: string,
): Promise<void> {
  const refCode = await fetchOrderRefCode(tx, orderId);
  const linkedDriverId = await fetchLinkedDriverId(tx, orderId);
  await emitNotifications(tx, {
    type: "ORDER_CANCELLED",
    orderId,
    orderRefCode: refCode,
    orderSellerUsername: sellerUsername,
    linkedDriverId,
  });
}
