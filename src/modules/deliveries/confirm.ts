import { and, eq, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import {
  clients,
  deliveries,
  driverTasks,
  orders,
  payments,
  users,
} from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import { validateD35Readiness } from "@/modules/invoices/d35-gate";
import { issueInvoiceInTx } from "@/modules/invoices/issue";
import { round2 } from "@/lib/money";
import { bridgeCollection } from "@/modules/treasury/service";
import { ensureDriverAssigned } from "./assign";
import { computeBonusesOnConfirm } from "./bonuses";
import { deliveryRowToDto } from "./mappers";
import {
  enforceDeliveryMutationPermission,
  type DeliveryClaims,
} from "./permissions";
import type { ConfirmDeliveryInput, DeliveryDto } from "./dto";

export type ConfirmDeliveryResult = {
  delivery: DeliveryDto;
  invoiceId: number;
};

/** Europe/Paris ISO date string (YYYY-MM-DD) for orders.delivery_date (D-35). */
function formatParisIsoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Phase 4.0 confirm-delivery flow (extracted to keep service.ts under the
// ESLint max-lines rule). Encapsulates the full transaction body that runs
// on POST /api/v1/deliveries/[id]/confirm-delivery:
//   1. Lock + validate delivery (status="جاري التوصيل", has driver).
//   2. Lock + read parent order for caching/payment method/running totals.
//   3. Flip delivery → "تم التوصيل" + confirmationDate.
//   4. Flip parent order → "مؤكد".
//   5. Mark the linked driver_task → "completed".
//   6. Insert payments row (type='collection') if paidAmount > 0 + update
//      order.advancePaid + paymentStatus.
//   7. Compute + insert bonuses (per-item seller, one per-delivery driver).
//   8. Write activity_log (action='confirm').

type DeliveryLockRow = {
  id: number;
  status: string;
  order_id: number;
  assigned_driver_id: number | null;
  date: string;
  created_by: string;
};

async function lockDelivery(tx: DbTx, id: number): Promise<DeliveryLockRow> {
  const res = await tx.execute(
    sql`SELECT id, status, order_id, assigned_driver_id, date, created_by
        FROM deliveries WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  const rows = (res as unknown as { rows?: DeliveryLockRow[] }).rows ?? [];
  if (rows.length === 0) throw new NotFoundError(`التوصيل رقم ${id}`);
  return rows[0];
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

export async function confirmDelivery(
  tx: DbTx,
  id: number,
  input: ConfirmDeliveryInput,
  claims: DeliveryClaims,
): Promise<ConfirmDeliveryResult> {
  // D-35 gate FIRST — before any mutation. If mandatory mentions are missing
  // the tx rolls back clean: delivery stays "جاري التوصيل", order stays at
  // its prior status, no payment/bonus/invoice rows written.
  await validateD35Readiness(tx);

  const current = await lockDelivery(tx, id);

  // BR-23: self-assign the confirmer if the delivery has no driver yet and the
  // caller is a driver. Admins with null driver still raise NO_DRIVER_ASSIGNED.
  const assign = await ensureDriverAssigned(tx, {
    deliveryId: id,
    currentAssignedDriverId: current.assigned_driver_id,
    claims,
    initialTaskStatus: "in_progress",
  });

  // Post-assign permission check — drivers may only confirm their own delivery,
  // admins are unrestricted.
  enforceDeliveryMutationPermission(
    { assignedDriverId: assign.driverUserId },
    claims,
  );

  if (current.status !== "جاري التوصيل") {
    throw new ConflictError(
      `الحالة الحالية للتوصيل "${current.status}" لا تسمح بالتأكيد.`,
      "INVALID_STATE_TRANSITION",
      { from: current.status, to: "تم التوصيل" },
    );
  }

  const orderLock = await tx.execute(
    sql`SELECT id, status, payment_method, total_amount, advance_paid, client_id, created_by
        FROM orders WHERE id = ${current.order_id} FOR UPDATE`,
  );
  const orderRows = (orderLock as unknown as {
    rows?: Array<{
      id: number;
      status: string;
      payment_method: string;
      total_amount: string;
      advance_paid: string;
      client_id: number;
      created_by: string;
    }>;
  }).rows ?? [];
  if (orderRows.length === 0) {
    throw new NotFoundError(`الطلب رقم ${current.order_id}`);
  }
  const order = orderRows[0];
  const paymentMethod = input.paymentMethod ?? order.payment_method;

  // Phase 4.3.2 — round the incoming paidAmount ONCE and use the rounded
  // value for every downstream decision and write (OVERPAYMENT check,
  // BR-07 check, paidAmount>0 branch gate, bridgeCollection, payments
  // insert, orders.advance_paid update, activity_log). This closes the
  // sub-cent drift where Zod-refine is bypassed by an internal caller:
  // a raw 0.004 cannot spawn a payment row or treasury_movement now.
  //
  // Defense-in-depth: if the caller sent a positive amount that collapses
  // to < 0.01 after rounding (must be a bypassed Zod path), reject
  // outright instead of silently dropping to the paidAmount=0 branch.
  const paidAmount = round2(input.paidAmount);
  if (input.paidAmount > 0 && paidAmount < 0.01) {
    throw new BusinessRuleError(
      "المبلغ المدفوع يجب أن يكون 0.01€ على الأقل.",
      "VALIDATION_FAILED",
      400,
      "confirmDelivery: rounded paidAmount below 0.01 (sub-cent)",
      { rawPaidAmount: input.paidAmount, roundedPaidAmount: paidAmount },
    );
  }

  // BR-07 + BR-09: cash/bank must be paid in full at delivery; paid can never
  // exceed the outstanding remaining. 0.005€ tolerance matches BR-09 spec.
  const totalAmount = Number(order.total_amount);
  const advancePaid = Number(order.advance_paid);
  const remaining = totalAmount - advancePaid;
  if (paidAmount > remaining + 0.005) {
    throw new ConflictError(
      `المبلغ المدفوع (${paidAmount.toFixed(2)}€) يتجاوز المتبقي على الطلب (${remaining.toFixed(2)}€).`,
      "OVERPAYMENT",
      { paidAmount, remaining, orderId: order.id },
    );
  }
  if (
    paymentMethod !== "آجل" &&
    Math.abs(paidAmount - remaining) > 0.005
  ) {
    throw new BusinessRuleError(
      `الدفع بـ"${paymentMethod}" يستوجب تسديد المتبقي كاملاً عند التسليم (${remaining.toFixed(2)}€).`,
      "INCOMPLETE_CASH_PAYMENT",
      400,
      undefined,
      {
        paymentMethod,
        paidAmount,
        remaining,
        orderId: order.id,
      },
    );
  }

  const clientRows = await tx
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.id, order.client_id))
    .limit(1);
  const client = clientRows[0];

  const driver = assign.selfAssigned
    ? { id: assign.driverUserId, username: assign.driverUsername }
    : await resolveDriver(tx, assign.driverUserId);
  const now = new Date();
  // D-accounting: payments.date + bonuses.date must book into the PERIOD of the
  // actual confirm moment, not the order's creation date. 00_DECISIONS §treasury
  // and 10_Calculation_Formulas §bonuses (BR-31) both key period aggregates
  // off these columns, so a 10-Jan order confirmed on 15-Jan must land in the
  // 15-Jan period.
  const confirmDate = formatParisIsoDate(now);

  // 1. Delivery → تم التوصيل.
  await tx
    .update(deliveries)
    .set({
      status: "تم التوصيل",
      confirmationDate: now,
      notes: input.notes || undefined,
      updatedBy: claims.username,
      updatedAt: now,
    })
    .where(eq(deliveries.id, id));

  // 2. Order → مؤكد (D-35: delivery_date + confirmation_date filled now).
  await tx
    .update(orders)
    .set({
      status: "مؤكد",
      deliveryDate: confirmDate,
      confirmationDate: now,
      updatedBy: claims.username,
      updatedAt: now,
    })
    .where(eq(orders.id, order.id));

  // 3. driver_task → completed.
  await tx
    .update(driverTasks)
    .set({ status: "completed", completedAt: now })
    .where(
      and(
        eq(driverTasks.relatedEntityType, "delivery"),
        eq(driverTasks.relatedEntityId, id),
      ),
    );

  // 4. Collection payment row (signed positive per D-06). Credit sales may
  // confirm with paidAmount=0; delivery still succeeds.
  // Phase 4.2: bridge to treasury FIRST — BR-55b cap check + BR-55 movement
  // happen before the payments insert so a cap breach rolls back everything.
  if (paidAmount > 0) {
    await bridgeCollection(tx, {
      orderId: order.id,
      driverUserId: driver.id,
      amount: paidAmount,
      confirmDate,
      createdBy: claims.username,
    });

    await tx.insert(payments).values({
      orderId: order.id,
      clientId: order.client_id,
      clientNameCached: client?.name ?? "",
      date: confirmDate,
      type: "collection",
      paymentMethod,
      amount: paidAmount.toFixed(2),
      notes: input.notes,
      createdBy: claims.username,
    });

    const newAdvance = round2(Number(order.advance_paid) + paidAmount);
    const paymentStatus =
      newAdvance >= Number(order.total_amount) - 0.005
        ? "paid"
        : newAdvance > 0
        ? "partial"
        : "pending";
    await tx
      .update(orders)
      .set({
        advancePaid: newAdvance.toFixed(2),
        paymentStatus,
        updatedBy: claims.username,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));
  }

  // 5. Bonuses (13_Commission_Rules). BR-31 + 10_Calculation_Formulas §bonuses:
  // bonuses.date is the confirm-moment period, not the order date.
  const bonusResult = await computeBonusesOnConfirm(tx, {
    orderId: order.id,
    deliveryId: id,
    date: confirmDate,
    sellerUsername: order.created_by,
    driverUserId: driver.id,
    driverUsername: driver.username,
  });

  // 6. Invoice issuance (BR-63). D-35 gate already ran at the top; this insert
  // cannot surprise us with missing mentions. Same tx → atomic with everything
  // else above.
  const issued = await issueInvoiceInTx(tx, {
    orderId: order.id,
    deliveryId: id,
    confirmDate,
    sellerUsername: order.created_by,
    driverUsername: driver.username,
  });

  await logActivity(tx, {
    action: "confirm",
    entityType: "deliveries",
    entityId: id,
    userId: claims.userId,
    username: claims.username,
    details: {
      orderId: order.id,
      paidAmount,
      paymentMethod,
      sellerBonusRows: bonusResult.sellerRowsInserted,
      driverBonusRow: bonusResult.driverRowInserted,
      invoiceId: issued.id,
      invoiceRefCode: issued.refCode,
    },
  });

  const rows = await tx
    .select()
    .from(deliveries)
    .where(eq(deliveries.id, id))
    .limit(1);
  return { delivery: deliveryRowToDto(rows[0]), invoiceId: issued.id };
}
