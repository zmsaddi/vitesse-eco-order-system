import { eq, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { deliveries } from "@/db/schema";
import { emitNotifications } from "@/modules/notifications/events";

// Phase 5.1 — notification emitters for the deliveries module extracted so
// `confirm.ts` stays under the 300-line cap.

/**
 * DELIVERY_CONFIRMED + PAYMENT_RECEIVED fan-out in one call. The confirm
 * flow always fires DELIVERY_CONFIRMED; PAYMENT_RECEIVED only when paid > 0.
 * `paidAmount` is the already-rounded value from confirm.ts.
 */
export async function emitDeliveryConfirmedWithPayment(
  tx: DbTx,
  args: {
    deliveryId: number;
    orderId: number;
    orderSellerUsername: string;
    paidAmount: number;
  },
): Promise<void> {
  const ordRes = await tx.execute(
    sql`SELECT ref_code FROM orders WHERE id = ${args.orderId} LIMIT 1`,
  );
  const ordRefCode =
    (ordRes as unknown as { rows?: Array<{ ref_code: string }> }).rows?.[0]
      ?.ref_code ?? `ORD-${args.orderId}`;

  const delRefRows = await tx
    .select({ refCode: deliveries.refCode })
    .from(deliveries)
    .where(eq(deliveries.id, args.deliveryId))
    .limit(1);
  const delRefCode = delRefRows[0]?.refCode ?? `DL-${args.deliveryId}`;

  await emitNotifications(tx, {
    type: "DELIVERY_CONFIRMED",
    deliveryId: args.deliveryId,
    deliveryRefCode: delRefCode,
    orderSellerUsername: args.orderSellerUsername,
  });

  if (args.paidAmount > 0) {
    await emitNotifications(tx, {
      type: "PAYMENT_RECEIVED",
      orderId: args.orderId,
      orderRefCode: ordRefCode,
      amount: args.paidAmount.toFixed(2),
    });
  }
}
