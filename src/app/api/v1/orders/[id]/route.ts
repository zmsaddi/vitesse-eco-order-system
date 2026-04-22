import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { redactOrderForRole } from "@/modules/orders/redaction";
import { getOrderById } from "@/modules/orders/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/orders/[id] — read order with items.
// Read-only; all authenticated roles can fetch (visibility filtering is Phase 3.x).

export async function GET(request: Request, { params }: Params) {
  try {
    // Phase 3.0.1: role gate at API level excludes driver + stock_keeper (no
    // delivery-linkage / prep-link visibility available until Phase 4). Service
    // layer further narrows seller to own-orders only (createdBy).
    const claims = await requireRole(request, ["pm", "gm", "manager", "seller"]);
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId < 1) {
      throw new ValidationError("معرِّف الطلب غير صحيح");
    }
    const order = await withRead(undefined, (db) => getOrderById(db, orderId, claims));
    return await jsonWithUnreadCount({ order: redactOrderForRole(order, claims.role) }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
