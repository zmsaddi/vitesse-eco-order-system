import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { getSupplierById, updateSupplier } from "@/modules/suppliers/service";
import { UpdateSupplierPatch } from "@/modules/suppliers/dto";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "stock_keeper"]);
    const { id } = await params;
    const supplierId = Number(id);
    if (!Number.isFinite(supplierId) || supplierId < 1) {
      throw new ValidationError("معرِّف المورد غير صحيح");
    }
    const supplier = await withRead(undefined, (db) => getSupplierById(db, supplierId));
    return await jsonWithUnreadCount({ supplier }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const { id } = await params;
    const supplierId = Number(id);
    if (!Number.isFinite(supplierId) || supplierId < 1) {
      throw new ValidationError("معرِّف المورد غير صحيح");
    }
    const body = await request.json().catch(() => null);
    const parsed = UpdateSupplierPatch.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const supplier = await withTxInRoute(undefined, (tx) =>
      updateSupplier(tx, supplierId, parsed.data, claims.username),
    );
    return await jsonWithUnreadCount({ supplier }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
