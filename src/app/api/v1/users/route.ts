import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { createUser, listUsersPaginated } from "@/modules/users/service";
import { CreateUserInput } from "@/modules/users/dto";

// GET /api/v1/users — paginated list. PM/GM only.
// Phase 2b: ?limit + ?offset + ?includeInactive=true.
//
// Response: { users, total, limit, offset }.

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const url = new URL(request.url);
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const offset = url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : undefined;
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    const result = await withRead(undefined, (db) =>
      listUsersPaginated(db, { limit, offset, includeInactive }),
    );
    return await jsonWithUnreadCount(
      {
        users: result.rows,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
      200,
      claims.userId,
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);

    const body = await request.json().catch(() => null);
    const parsed = CreateUserInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة. راجع الحقول المميَّزة", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const user = await withTxInRoute(undefined, (tx) =>
      createUser(tx, parsed.data, claims.username),
    );
    return await jsonWithUnreadCount({ user }, 201, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
