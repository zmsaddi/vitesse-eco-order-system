import { PermissionError } from "@/lib/api-errors";
import type { Role } from "@/lib/session-claims";

// Phase 4.1 — invoice visibility (16_Data_Visibility §فواتير).
//
// pm/gm/manager : all
// seller        : invoices whose parent order was created by this seller
// driver        : invoices whose parent delivery was assigned to this driver
// stock_keeper  : none

export type InvoiceClaims = {
  userId: number;
  username: string;
  role: Role;
};

export type InvoiceVisibilityRow = {
  // Either the parent order's creator (for seller check) …
  orderCreatedBy: string;
  // … or the parent delivery's assigned driver id (for driver check).
  deliveryAssignedDriverId: number | null;
};

export function enforceInvoiceVisibility(
  row: InvoiceVisibilityRow,
  claims: InvoiceClaims,
): void {
  switch (claims.role) {
    case "pm":
    case "gm":
    case "manager":
      return;
    case "seller":
      if (row.orderCreatedBy !== claims.username) {
        throw new PermissionError(
          "لا تملك صلاحية رؤية هذه الفاتورة (خاصة بالبائع المُنشئ للطلب).",
        );
      }
      return;
    case "driver":
      if (row.deliveryAssignedDriverId !== claims.userId) {
        throw new PermissionError(
          "لا تملك صلاحية رؤية هذه الفاتورة (خاصة بالسائق المُسنَد على التوصيل).",
        );
      }
      return;
    case "stock_keeper":
      throw new PermissionError(
        "الفواتير غير متاحة للـ stock_keeper.",
      );
  }
}
