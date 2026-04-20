import { PermissionError } from "@/lib/api-errors";
import type { Role } from "@/lib/session-claims";

// Phase 4.0 deliveries visibility (16_Data_Visibility §filtering):
//   pm/gm/manager     → all deliveries.
//   driver            → deliveries where assigned_driver_id === self.userId.
//   seller / stock_keeper → 403 (future: seller may see deliveries linked to
//     their own orders via a dedicated list endpoint; out of Phase 4.0 scope).

export type DeliveryClaims = {
  userId: number;
  username: string;
  role: Role;
};

export function enforceDeliveryVisibility(
  row: { assignedDriverId: number | null },
  claims: DeliveryClaims,
): void {
  switch (claims.role) {
    case "pm":
    case "gm":
    case "manager":
      return;
    case "driver":
      if (row.assignedDriverId !== claims.userId) {
        throw new PermissionError(
          "هذا التوصيل غير مسند إليك.",
        );
      }
      return;
    case "seller":
      throw new PermissionError(
        "رؤية البائع للتوصيلات تمر عبر طلباته (متوفرة في مرحلة لاحقة).",
      );
    case "stock_keeper":
      throw new PermissionError(
        "التوصيلات غير مرئية للـ stock_keeper.",
      );
  }
}

/** Start / confirm-delivery — driver must own the row; pm/gm/manager free. */
export function enforceDeliveryMutationPermission(
  row: { assignedDriverId: number | null },
  claims: DeliveryClaims,
): void {
  switch (claims.role) {
    case "pm":
    case "gm":
    case "manager":
      return;
    case "driver":
      if (row.assignedDriverId !== claims.userId) {
        throw new PermissionError(
          "لا تملك صلاحية تغيير حالة توصيل لم يُسند إليك.",
        );
      }
      return;
    default:
      throw new PermissionError("لا تملك صلاحية تغيير حالة التوصيل.");
  }
}
