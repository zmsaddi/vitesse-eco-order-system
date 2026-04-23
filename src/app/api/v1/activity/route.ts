import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { ListActivityQuery } from "@/modules/activity/dto";
import { listActivity } from "@/modules/activity/service";

export const runtime = "nodejs";

// GET /api/v1/activity — read-only activity-log feed.
// Roles: pm, gm, manager. seller/driver/stock_keeper → 403 FORBIDDEN.
// Manager scope: self + linked drivers (users.manager_id = self.userId).
// Supports filters: entityType, action, userId, dateFrom, dateTo + pagination.

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ListActivityQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const out = await withRead(undefined, (db) =>
      listActivity(db, parsed.data, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return await jsonWithUnreadCount(out, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
