import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { getUserById, updateUser } from "@/modules/users/service";
import { UpdateUserPatch } from "@/modules/users/dto";

// Dynamic route PUT /api/v1/users/[id] — PM/GM only, edit user.
// Soft-disable: pass { active: false } to deactivate (D-76 — no DELETE endpoint per D-04).
// All fields optional; any subset can be updated.
// Validation: UpdateUserPatch — SHARED with /users/[id]/edit Server Action (Phase 2b.1).

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId < 1) {
      throw new ValidationError("معرِّف المستخدم غير صحيح");
    }

    const user = await withRead(undefined, (db) => getUserById(db, userId));
    return await jsonWithUnreadCount({ user }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId < 1) {
      throw new ValidationError("معرِّف المستخدم غير صحيح");
    }

    const body = await request.json().catch(() => null);
    const parsed = UpdateUserPatch.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const user = await withTxInRoute(undefined, (tx) =>
      updateUser(tx, userId, parsed.data, claims.username),
    );
    return await jsonWithUnreadCount({ user }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
