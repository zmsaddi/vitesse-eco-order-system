import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { DashboardQuery } from "@/modules/dashboard/dto";
import { getDashboard } from "@/modules/dashboard/service";

export const runtime = "nodejs";

// GET /api/v1/dashboard — read-only KPIs + treasury balances + counts.
// Roles: pm, gm, manager. seller/driver/stock_keeper → 403 FORBIDDEN.
// Manager scope: revenue + counts + outstandingDebts filtered by team;
// netProfit + cashProfit returned as null (pm/gm-only).

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = DashboardQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const out = await withRead(undefined, (db) =>
      getDashboard(db, parsed.data, {
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
