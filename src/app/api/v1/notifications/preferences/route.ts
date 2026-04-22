import { withTxInRoute } from "@/db/client";
import { requireClaims } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { UpdatePreferencesInput } from "@/modules/notifications/dto";
import {
  listPreferences,
  updatePreferences,
} from "@/modules/notifications/service";

export const runtime = "nodejs";

// GET /api/v1/notifications/preferences — own-only list; lazy-seeds 14 rows
// on first call so the UI always renders a full matrix of toggles.
//
// PUT /api/v1/notifications/preferences — body `{ updates: [...] }` flips
// per-type enabled flags. Every write restricted to claims.userId.

export async function GET(request: Request) {
  try {
    const claims = await requireClaims(request);
    const prefs = await withTxInRoute(undefined, (tx) =>
      listPreferences(tx, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return await jsonWithUnreadCount(
      { preferences: prefs },
      200,
      claims.userId,
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const claims = await requireClaims(request);
    const body = await request.json().catch(() => null);
    const parsed = UpdatePreferencesInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const prefs = await withTxInRoute(undefined, (tx) =>
      updatePreferences(tx, parsed.data, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return await jsonWithUnreadCount(
      { preferences: prefs },
      200,
      claims.userId,
    );
  } catch (err) {
    return apiError(err);
  }
}
