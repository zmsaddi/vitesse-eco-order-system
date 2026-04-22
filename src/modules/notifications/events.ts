import { sql, type SQL } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { bustUnreadCountCache } from "@/lib/unread-count-header";
import { NOTIFICATION_TYPE_LABELS_AR, type NotificationType } from "./dto";

// Phase 5.1 — event emission helper.
//
// emitNotifications(tx, payload) is called by Phase-4 services from within
// their own tx so notification inserts commit-or-rollback as a single unit
// with the underlying mutation. No external fan-out; no queue.
//
// Phase 5.1a perf: the original implementation ran 3 separate round-trips per
// emission (resolveAudience → filterByPreferences → insert). In a full order
// flow that meant ~18-21 extra round-trips, enough to push multi-order tests
// past their 30s budget on WebSocket-to-Neon. The consolidated path runs a
// single `INSERT … SELECT … NOT EXISTS` so every emission is one round-trip.
//
// Preferences semantics unchanged: a row with enabled=false suppresses the
// insert; any user with no row is treated as opted-in (default-on).

type EmitPayload =
  | {
      type: "ORDER_CREATED";
      orderId: number;
      orderRefCode: string;
    }
  | {
      type: "ORDER_STARTED_PREPARATION";
      orderId: number;
      orderRefCode: string;
    }
  | {
      type: "ORDER_READY_FOR_DELIVERY";
      deliveryId: number;
      deliveryRefCode: string;
      assignedDriverId: number;
    }
  | {
      type: "DELIVERY_CONFIRMED";
      deliveryId: number;
      deliveryRefCode: string;
      orderSellerUsername: string;
    }
  | {
      type: "PAYMENT_RECEIVED";
      orderId: number;
      orderRefCode: string;
      amount: string;
    }
  | {
      type: "LOW_STOCK";
      productId: number;
      productName: string;
      remainingStock: string;
    }
  | {
      type: "NEW_TASK";
      deliveryId: number;
      deliveryRefCode: string;
      assignedDriverId: number;
    }
  | {
      type: "BONUS_CREATED";
      bonusId: number;
      bonusUserId: number;
      amount: string;
      orderRefCode: string;
    }
  | {
      type: "SETTLEMENT_ISSUED";
      settlementId: number;
      targetUserId: number;
      kind: "settlement" | "reward";
      amount: string;
    }
  | {
      type: "ORDER_CANCELLED";
      orderId: number;
      orderRefCode: string;
      orderSellerUsername: string;
      linkedDriverId: number | null;
    }
  | {
      type: "DRIVER_HANDOVER_DONE";
      movementId: number;
      managerUserId: number;
      amount: string;
    };

// Routing predicate per 26_Notifications.md lines 28–43. SQL fragment is
// embedded directly into the INSERT SELECT, so user_id resolution happens in
// one shot alongside the preference filter.
//
// SETTLEMENT_ISSUED is additionally restricted to seller/driver here as
// defence-in-depth: the matrix line marks settlements as seller/driver-only
// and /my-bonus (the click target) is seller/driver-only. Callers already
// assert the role at the business layer; this predicate makes any future
// slip at the call site silently drop the notification instead of pushing
// an unreachable link to a pm/gm/manager inbox.
function buildRecipientPredicate(payload: EmitPayload): SQL {
  switch (payload.type) {
    case "ORDER_CREATED":
      return sql`role IN ('pm','gm','manager','stock_keeper')`;
    case "ORDER_STARTED_PREPARATION":
      return sql`role = 'stock_keeper'`;
    case "LOW_STOCK":
      return sql`role IN ('pm','gm','manager','stock_keeper')`;
    case "PAYMENT_RECEIVED":
      return sql`role IN ('pm','gm','manager')`;
    case "DELIVERY_CONFIRMED":
      return sql`role IN ('pm','gm','manager') OR username = ${payload.orderSellerUsername}`;
    case "ORDER_CANCELLED": {
      const driverClause =
        payload.linkedDriverId != null
          ? sql` OR id = ${payload.linkedDriverId}`
          : sql``;
      return sql`role IN ('pm','gm','manager') OR username = ${payload.orderSellerUsername}${driverClause}`;
    }
    case "ORDER_READY_FOR_DELIVERY":
    case "NEW_TASK":
      return sql`id = ${payload.assignedDriverId}`;
    case "BONUS_CREATED":
      return sql`id = ${payload.bonusUserId}`;
    case "SETTLEMENT_ISSUED":
      return sql`id = ${payload.targetUserId} AND role IN ('seller','driver')`;
    case "DRIVER_HANDOVER_DONE":
      return sql`id = ${payload.managerUserId}`;
  }
}

function buildContent(payload: EmitPayload): {
  title: string;
  body: string;
  clickTarget: string | null;
} {
  const title = NOTIFICATION_TYPE_LABELS_AR[payload.type as NotificationType];
  switch (payload.type) {
    case "ORDER_CREATED":
    case "ORDER_STARTED_PREPARATION":
    case "ORDER_CANCELLED":
      return { title, body: `الطلب ${payload.orderRefCode}`, clickTarget: `/orders` };
    case "ORDER_READY_FOR_DELIVERY":
    case "NEW_TASK":
      return {
        title,
        body: `التوصيل ${payload.deliveryRefCode}`,
        clickTarget: `/driver-tasks`,
      };
    case "DELIVERY_CONFIRMED":
      return {
        title,
        body: `التوصيل ${payload.deliveryRefCode}`,
        clickTarget: `/deliveries`,
      };
    case "PAYMENT_RECEIVED":
      return {
        title,
        body: `${payload.amount}€ على الطلب ${payload.orderRefCode}`,
        clickTarget: `/orders`,
      };
    case "LOW_STOCK":
      return {
        title,
        body: `${payload.productName} — المتبقي ${payload.remainingStock}`,
        clickTarget: `/products`,
      };
    case "BONUS_CREATED":
      return {
        title,
        body: `${payload.amount}€ من الطلب ${payload.orderRefCode}`,
        clickTarget: `/my-bonus`,
      };
    case "SETTLEMENT_ISSUED":
      return {
        title:
          payload.kind === "reward"
            ? "مكافأة"
            : NOTIFICATION_TYPE_LABELS_AR.SETTLEMENT_ISSUED,
        body: `${payload.amount}€`,
        clickTarget: `/my-bonus`,
      };
    case "DRIVER_HANDOVER_DONE":
      return { title, body: `${payload.amount}€`, clickTarget: `/treasury` };
  }
}

/**
 * Emit a notification event. Called inside the caller's tx so rollback on the
 * parent mutation also rolls back the notifications — no orphan rows are
 * possible. Returns the inserted notification ids for test assertions.
 */
export async function emitNotifications(
  tx: DbTx,
  payload: EmitPayload,
): Promise<number[]> {
  const predicate = buildRecipientPredicate(payload);
  const content = buildContent(payload);
  const type = payload.type;

  // Single round-trip: resolve recipients (by role/username/id), filter out
  // anyone who has explicitly opted out, and insert. Default-on is encoded as
  // the `NOT EXISTS` on a disabled row.
  const res = await tx.execute(sql`
    INSERT INTO notifications (user_id, type, title, body, click_target)
    SELECT u.id, ${type}, ${content.title}, ${content.body}, ${content.clickTarget}
    FROM users u
    WHERE u.active = true
      AND (${predicate})
      AND NOT EXISTS (
        SELECT 1
        FROM notification_preferences p
        WHERE p.user_id = u.id
          AND p.notification_type = ${type}
          AND p.channel = 'in_app'
          AND p.enabled = false
      )
    RETURNING id, user_id
  `);

  const rows =
    (res as unknown as { rows?: Array<{ id: number; user_id: number }> }).rows ??
    [];
  for (const row of rows) bustUnreadCountCache(row.user_id);
  return rows.map((r) => r.id);
}
