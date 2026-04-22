import { withTxInRoute } from "@/db/client";
import { requireClaims } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { markRead } from "@/modules/notifications/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/notifications/[id]/mark-read — flip a single notification's
// read_at to NOW(). Roles: all authenticated (own-only enforced in service).
// Idempotency-Key: not required (re-read is a no-op; we return the current row).

export async function POST(request: Request, { params }: Params) {
  try {
    const claims = await requireClaims(request);
    const { id } = await params;
    const notificationId = Number(id);
    if (!Number.isFinite(notificationId) || notificationId < 1) {
      throw new ValidationError("معرِّف الإشعار غير صحيح");
    }
    const out = await withTxInRoute(undefined, (tx) =>
      markRead(tx, notificationId, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return await jsonWithUnreadCount({ notification: out }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
