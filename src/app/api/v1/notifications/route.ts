import { withRead } from "@/db/client";
import { requireClaims } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { ListNotificationsQuery } from "@/modules/notifications/dto";
import { listNotifications } from "@/modules/notifications/service";

export const runtime = "nodejs";

// GET /api/v1/notifications — own-only notifications list.
// Roles: all authenticated (own-only enforced in service by claims.userId).
// Emits `X-Unread-Count` header alongside the JSON body.

export async function GET(request: Request) {
  try {
    const claims = await requireClaims(request);
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ListNotificationsQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const out = await withRead(undefined, (db) =>
      listNotifications(db, parsed.data, {
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
