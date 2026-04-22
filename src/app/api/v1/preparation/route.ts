import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { listPreparationQueue } from "@/modules/orders/preparation";
import { redactOrdersForRole } from "@/modules/orders/redaction";

export const runtime = "nodejs";

// GET /api/v1/preparation — preparation queue for stock_keeper + admin roles.
// Returns orders whose status ∈ {محجوز, قيد التحضير} with full item lists.
// Sellers + drivers are NOT allowed here (driver sees deliveries queue in Phase 4;
// seller sees their own orders via /orders list — Phase 3.x).

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "stock_keeper"]);
    const url = new URL(request.url);
    const limit = url.searchParams.has("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const offset = url.searchParams.has("offset")
      ? Number(url.searchParams.get("offset"))
      : undefined;
    const result = await withRead(undefined, (db) =>
      listPreparationQueue(db, { limit, offset }),
    );
    return await jsonWithUnreadCount({
      orders: redactOrdersForRole(result.rows, claims.role),
      total: result.total,
    }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
