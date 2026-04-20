import { and, eq } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { deliveries, driverTasks } from "@/db/schema";
import { BusinessRuleError, PermissionError } from "@/lib/api-errors";
import type { DeliveryClaims } from "./permissions";

// Phase 4.0.1 — BR-23 self-assign helper.
//
// BR-23: "تعيين السائق اختياري، وأن المؤكِّد يصبح السائق ضمنيًا" — driver
// assignment on delivery creation is optional; the confirmer becomes the driver
// implicitly. In practice we only allow self-assign when the caller's role is
// 'driver' (pm/gm/manager cannot "become" a driver for bonus-attribution
// purposes — they must explicitly assign a real driver on create).
//
// Called at the top of start-delivery + confirm-delivery. If the delivery
// already has an assigned_driver_id, this is a no-op. Otherwise:
//   - caller is driver  → update delivery + insert driver_task (if absent).
//   - caller is admin   → throw NO_DRIVER_ASSIGNED (the admin must use create
//                         or a future /assign-driver endpoint).
//   - any other role    → PermissionError (route gate already blocks, but
//                         defense-in-depth).

export type SelfAssignOutcome = {
  driverUserId: number;
  driverUsername: string;
  selfAssigned: boolean;
};

export async function ensureDriverAssigned(
  tx: DbTx,
  args: {
    deliveryId: number;
    currentAssignedDriverId: number | null;
    claims: DeliveryClaims;
    initialTaskStatus: "pending" | "in_progress" | "completed";
  },
): Promise<SelfAssignOutcome> {
  if (args.currentAssignedDriverId !== null) {
    // Already assigned — caller is responsible for the ownership check
    // elsewhere (enforceDeliveryMutationPermission). Return the existing id
    // alongside username='' (caller resolves via users table when needed).
    return {
      driverUserId: args.currentAssignedDriverId,
      driverUsername: "",
      selfAssigned: false,
    };
  }

  if (args.claims.role !== "driver") {
    throw new BusinessRuleError(
      "لا يمكن المتابعة بلا سائق مُسند. أَسنِد سائقاً أولاً أو دع السائق يتابع بنفسه (BR-23).",
      "NO_DRIVER_ASSIGNED",
      400,
      undefined,
      { deliveryId: args.deliveryId, callerRole: args.claims.role },
    );
  }

  // Self-assign.
  await tx
    .update(deliveries)
    .set({
      assignedDriverId: args.claims.userId,
      assignedDriverUsernameCached: args.claims.username,
      updatedBy: args.claims.username,
      updatedAt: new Date(),
    })
    .where(eq(deliveries.id, args.deliveryId));

  // Spawn the driver_task if one doesn't exist yet (createDelivery with a
  // driver already spawns pending; createDelivery with null driver does NOT).
  const existing = await tx
    .select({ id: driverTasks.id })
    .from(driverTasks)
    .where(
      and(
        eq(driverTasks.relatedEntityType, "delivery"),
        eq(driverTasks.relatedEntityId, args.deliveryId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    await tx.insert(driverTasks).values({
      type: "delivery",
      status: args.initialTaskStatus,
      assignedDriverId: args.claims.userId,
      relatedEntityType: "delivery",
      relatedEntityId: args.deliveryId,
      notes: "",
      completedAt: args.initialTaskStatus === "completed" ? new Date() : null,
    });
  }

  return {
    driverUserId: args.claims.userId,
    driverUsername: args.claims.username,
    selfAssigned: true,
  };
}

// Defense-in-depth check — route-level role gate already blocks seller + stock_keeper.
export function assertRoleCanMutateDelivery(claims: DeliveryClaims): void {
  if (
    claims.role !== "pm" &&
    claims.role !== "gm" &&
    claims.role !== "manager" &&
    claims.role !== "driver"
  ) {
    throw new PermissionError("لا تملك صلاحية تغيير حالة التوصيل.");
  }
}
