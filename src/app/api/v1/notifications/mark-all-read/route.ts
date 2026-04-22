import { withTxInRoute } from "@/db/client";
import { requireClaims } from "@/lib/session-claims";
import { apiError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { markAllRead } from "@/modules/notifications/service";

export const runtime = "nodejs";

// POST /api/v1/notifications/mark-all-read — flip every unread notification
// for the caller to read. Roles: all authenticated. Idempotency-Key: not
// required (replays are last-write-wins no-ops).

export async function POST(request: Request) {
  try {
    const claims = await requireClaims(request);
    const out = await withTxInRoute(undefined, (tx) =>
      markAllRead(tx, {
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
