import { PermissionError } from "@/lib/api-errors";
import type { Role } from "@/lib/session-claims";

// Phase 3.0.1: role-based visibility + cancel-permission enforcement for orders.
// Mirrors 16_Data_Visibility.md "فلترة السجلات" row + BR-16 "صلاحيات الإلغاء".

export type OrderClaims = {
  userId: number;
  username: string;
  role: Role;
};

/**
 * 16_Data_Visibility: pm/gm/manager = all; seller = own (createdBy); driver =
 * linked-via-delivery (Phase 4); stock_keeper = no direct visibility (Phase 3.0
 * stock_keeper works via /preparation list, not per-order GET).
 */
export function enforceOrderVisibility(
  row: { createdBy: string },
  claims: OrderClaims,
): void {
  switch (claims.role) {
    case "pm":
    case "gm":
    case "manager":
      return;
    case "seller":
      if (row.createdBy !== claims.username) {
        throw new PermissionError(
          "لا تملك صلاحية رؤية هذا الطلب (خاص بالبائع المُنشئ).",
        );
      }
      return;
    case "driver":
      throw new PermissionError(
        "رؤية السائق مرتبطة بالتوصيلات (متوفرة في Phase 4).",
      );
    case "stock_keeper":
      throw new PermissionError(
        "الطلبات غير مرئية للـ stock_keeper في Phase 3.0 (استخدم شاشة التحضير).",
      );
  }
}

/**
 * BR-16: PM/GM any status; Manager status='محجوز' only; Seller own + status='محجوز';
 * Driver/Stock Keeper forbidden.
 * Caller has already verified status != 'ملغي' (idempotency guard at service entry).
 */
export function enforceCancelPermission(
  row: { status: string; createdBy: string },
  claims: OrderClaims,
): void {
  switch (claims.role) {
    case "pm":
    case "gm":
      return;
    case "manager":
      if (row.status !== "محجوز") {
        throw new PermissionError(
          `المدير يستطيع إلغاء الطلبات في حالة "محجوز" فقط (الحالة الحالية: "${row.status}").`,
        );
      }
      return;
    case "seller":
      if (row.createdBy !== claims.username) {
        throw new PermissionError("لا تملك صلاحية إلغاء طلب لم تُنشئه.");
      }
      if (row.status !== "محجوز") {
        throw new PermissionError(
          `البائع يستطيع إلغاء طلباته في حالة "محجوز" فقط (الحالة الحالية: "${row.status}").`,
        );
      }
      return;
    default:
      throw new PermissionError("لا تملك صلاحية إلغاء الطلبات.");
  }
}
