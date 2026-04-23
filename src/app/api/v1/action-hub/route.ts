import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { loadActionHubPayload } from "@/modules/action-hub/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 6.2 — GET /api/v1/action-hub.
// Canonical endpoint for the Action Hub landing (pm/gm/manager role-home).
// seller / driver / stock_keeper → 403 (also redirected earlier by page-level
// enforcePageRole; the API gate is defence-in-depth for non-browser callers).

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const out = await withRead(undefined, (db) =>
      loadActionHubPayload(db, {
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
