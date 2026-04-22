import { withRead } from "@/db/client";
import { PermissionError, apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { requireRole } from "@/lib/session-claims";
import { listTasksForDriver } from "@/modules/driver-tasks/service";

export const runtime = "nodejs";

// GET /api/v1/driver-tasks — the driver's active task queue.
// Driver sees their own; pm/gm/manager can pass ?driverUserId=N to list any
// driver's tasks (operational oversight). Seller + stock_keeper → 403.

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, [
      "pm",
      "gm",
      "manager",
      "driver",
    ]);
    const url = new URL(request.url);
    const includeCompleted = url.searchParams.get("includeCompleted") === "1";
    const limit = url.searchParams.has("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const offset = url.searchParams.has("offset")
      ? Number(url.searchParams.get("offset"))
      : undefined;

    let targetDriverId = claims.userId;
    if (url.searchParams.has("driverUserId")) {
      const requested = Number(url.searchParams.get("driverUserId"));
      if (!Number.isFinite(requested) || requested < 1) {
        throw new ValidationError("معرِّف السائق غير صحيح");
      }
      // Only admins may override target driver.
      if (claims.role === "driver" && requested !== claims.userId) {
        throw new PermissionError("لا يمكنك استعراض مهام سائق آخر.");
      }
      targetDriverId = requested;
    }

    const result = await withRead(undefined, (db) =>
      listTasksForDriver(db, targetDriverId, { includeCompleted, limit, offset }),
    );
    return await jsonWithUnreadCount({ tasks: result.rows, total: result.total }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
