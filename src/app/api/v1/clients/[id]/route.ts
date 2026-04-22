import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { getClientById, updateClient } from "@/modules/clients/service";
import { UpdateClientInput } from "@/modules/clients/dto";

// GET + PUT /api/v1/clients/[id] — edit client (pm/gm/manager only per matrix).

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "seller"]);
    const { id } = await params;
    const clientId = Number(id);
    if (!Number.isFinite(clientId) || clientId < 1) {
      throw new ValidationError("معرِّف العميل غير صحيح");
    }

    const client = await withRead(undefined, (db) => getClientById(db, clientId));
    return await jsonWithUnreadCount({ client }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const { id } = await params;
    const clientId = Number(id);
    if (!Number.isFinite(clientId) || clientId < 1) {
      throw new ValidationError("معرِّف العميل غير صحيح");
    }

    const body = await request.json().catch(() => null);
    const parsed = UpdateClientInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة. راجع الحقول المميَّزة", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const client = await withTxInRoute(undefined, (tx) =>
      updateClient(tx, clientId, parsed.data, claims.username),
    );
    return await jsonWithUnreadCount({ client }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
