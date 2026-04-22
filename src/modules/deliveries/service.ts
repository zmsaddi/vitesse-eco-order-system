import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import {
  clients,
  deliveries,
  driverTasks,
  users,
} from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import { emitNotifications } from "@/modules/notifications/events";
import { ensureDriverAssigned } from "./assign";
import { deliveryRowToDto } from "./mappers";
import {
  enforceDeliveryMutationPermission,
  enforceDeliveryVisibility,
  type DeliveryClaims,
} from "./permissions";
import { generateDeliveryRefCode } from "./ref-code";
import type {
  CreateDeliveryInput,
  DeliveryDto,
} from "./dto";

// Phase 4.0 deliveries service. State machine:
//   (create from ready order)  →  status="جاهز"
//   start                        →  status="جاري التوصيل"
//   confirm-delivery             →  status="تم التوصيل"  (→ ./confirm.ts)
//
// Every mutation: activity_log inside the same tx; idempotency at the route.

export { confirmDelivery } from "./confirm";

export async function getDeliveryById(
  db: DbHandle,
  id: number,
  claims: DeliveryClaims,
): Promise<DeliveryDto> {
  const rows = await db
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.id, id), isNull(deliveries.deletedAt)))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError(`التوصيل رقم ${id}`);
  enforceDeliveryVisibility(rows[0], claims);
  return deliveryRowToDto(rows[0]);
}

async function resolveDriver(
  tx: DbTx,
  driverUserId: number,
): Promise<{ id: number; username: string }> {
  const rows = await tx
    .select({ id: users.id, username: users.username, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, driverUserId))
    .limit(1);
  if (rows.length === 0 || !rows[0].active) {
    throw new NotFoundError(`السائق رقم ${driverUserId}`);
  }
  if (rows[0].role !== "driver") {
    throw new BusinessRuleError(
      `المستخدم ${rows[0].username} ليس سائقاً.`,
      "NOT_A_DRIVER",
      400,
      undefined,
      { userId: driverUserId, role: rows[0].role },
    );
  }
  return { id: rows[0].id, username: rows[0].username };
}

export async function createDelivery(
  tx: DbTx,
  input: CreateDeliveryInput,
  claims: DeliveryClaims,
): Promise<DeliveryDto> {
  const orderLock = await tx.execute(
    sql`SELECT id, status, date, client_id FROM orders
        WHERE id = ${input.orderId} AND deleted_at IS NULL FOR UPDATE`,
  );
  const orderRows = (orderLock as unknown as {
    rows?: Array<{ id: number; status: string; date: string; client_id: number }>;
  }).rows ?? [];
  if (orderRows.length === 0) throw new NotFoundError(`الطلب رقم ${input.orderId}`);
  const order = orderRows[0];
  if (order.status !== "جاهز") {
    throw new ConflictError(
      `لا يمكن إنشاء توصيل: الطلب ليس في حالة "جاهز" (الحالة الحالية: "${order.status}").`,
      "ORDER_NOT_READY",
      { orderId: order.id, status: order.status },
    );
  }

  const existing = await tx
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.orderId, input.orderId), isNull(deliveries.deletedAt)))
    .limit(1);
  if (existing.length > 0) {
    throw new ConflictError(
      "يوجد توصيل نشط لهذا الطلب بالفعل.",
      "DELIVERY_ALREADY_EXISTS",
      { orderId: input.orderId, existingDeliveryId: existing[0].id },
    );
  }

  const clientRows = await tx
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      address: clients.address,
    })
    .from(clients)
    .where(eq(clients.id, order.client_id))
    .limit(1);
  if (clientRows.length === 0) {
    throw new NotFoundError(`العميل رقم ${order.client_id}`);
  }
  const client = clientRows[0];

  let driver: { id: number; username: string } | null = null;
  if (input.assignedDriverId !== null) {
    driver = await resolveDriver(tx, input.assignedDriverId);
  }

  const refCode = await generateDeliveryRefCode(tx);

  const inserted = await tx
    .insert(deliveries)
    .values({
      refCode,
      date: order.date,
      orderId: input.orderId,
      clientId: client.id,
      clientNameCached: client.name,
      clientPhoneCached: client.phone ?? "",
      address: client.address ?? "",
      status: "جاهز",
      assignedDriverId: driver?.id ?? null,
      assignedDriverUsernameCached: driver?.username ?? "",
      notes: input.notes,
      createdBy: claims.username,
    })
    .returning();
  const delivery = inserted[0];

  if (driver) {
    await tx.insert(driverTasks).values({
      type: "delivery",
      status: "pending",
      assignedDriverId: driver.id,
      relatedEntityType: "delivery",
      relatedEntityId: delivery.id,
      notes: "",
    });
  }

  await logActivity(tx, {
    action: "create",
    entityType: "deliveries",
    entityId: delivery.id,
    entityRefCode: refCode,
    userId: claims.userId,
    username: claims.username,
    details: {
      orderId: input.orderId,
      assignedDriverId: driver?.id ?? null,
    },
  });

  // Phase 5.1 — driver-facing notifications at delivery-with-driver creation.
  // ORDER_READY_FOR_DELIVERY (line 32 of the matrix) + NEW_TASK (line 36)
  // both target the assigned driver. They fire together because the
  // matrix lists them as distinct toggles (the user can disable either
  // independently in /settings/notifications).
  if (driver) {
    await emitNotifications(tx, {
      type: "ORDER_READY_FOR_DELIVERY",
      deliveryId: delivery.id,
      deliveryRefCode: refCode,
      assignedDriverId: driver.id,
    });
    await emitNotifications(tx, {
      type: "NEW_TASK",
      deliveryId: delivery.id,
      deliveryRefCode: refCode,
      assignedDriverId: driver.id,
    });
  }

  return deliveryRowToDto(delivery);
}

export async function startDelivery(
  tx: DbTx,
  id: number,
  claims: DeliveryClaims,
): Promise<DeliveryDto> {
  const lockRes = await tx.execute(
    sql`SELECT id, status, assigned_driver_id
        FROM deliveries WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  const rows = (lockRes as unknown as {
    rows?: Array<{ id: number; status: string; assigned_driver_id: number | null }>;
  }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`التوصيل رقم ${id}`);
  const current = rows[0];

  // BR-23: allow driver self-assign when no driver is set. After this helper
  // runs, delivery.assigned_driver_id is populated (either pre-existing or just
  // assigned). Admin roles with null driver trigger NO_DRIVER_ASSIGNED.
  const assign = await ensureDriverAssigned(tx, {
    deliveryId: id,
    currentAssignedDriverId: current.assigned_driver_id,
    claims,
    initialTaskStatus: "pending", // task flipped to in_progress below
  });

  // Permission (post-assign; driver-self always valid now, admin unrestricted).
  enforceDeliveryMutationPermission(
    { assignedDriverId: assign.driverUserId },
    claims,
  );

  if (current.status !== "جاهز") {
    throw new ConflictError(
      `الحالة الحالية للتوصيل "${current.status}" لا تسمح بالبدء.`,
      "INVALID_STATE_TRANSITION",
      { from: current.status, to: "جاري التوصيل" },
    );
  }

  await tx
    .update(deliveries)
    .set({ status: "جاري التوصيل", updatedBy: claims.username, updatedAt: new Date() })
    .where(eq(deliveries.id, id));

  await tx
    .update(driverTasks)
    .set({ status: "in_progress" })
    .where(
      and(
        eq(driverTasks.relatedEntityType, "delivery"),
        eq(driverTasks.relatedEntityId, id),
      ),
    );

  await logActivity(tx, {
    action: "update",
    entityType: "deliveries",
    entityId: id,
    userId: claims.userId,
    username: claims.username,
    details: { transition: "جاهز → جاري التوصيل" },
  });

  const result = await tx
    .select()
    .from(deliveries)
    .where(eq(deliveries.id, id))
    .limit(1);
  return deliveryRowToDto(result[0]);
}

/** List view filtered to an assigned driver — used by GET /api/v1/driver-tasks. */
export async function listDeliveriesForDriver(
  db: DbHandle,
  driverUserId: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: DeliveryDto[]; total: number }> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const filter = and(
    eq(deliveries.assignedDriverId, driverUserId),
    isNull(deliveries.deletedAt),
  );
  const rowsList = await db
    .select()
    .from(deliveries)
    .where(filter)
    .orderBy(asc(deliveries.date), asc(deliveries.id))
    .limit(limit)
    .offset(offset);
  const countRes = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM deliveries
        WHERE assigned_driver_id = ${driverUserId} AND deleted_at IS NULL`,
  );
  const total =
    (countRes as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? 0;
  return { rows: rowsList.map(deliveryRowToDto), total };
}
