import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { getProductById, updateProduct } from "@/modules/products/service";
import { UpdateProductPatch } from "@/modules/products/dto";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "seller", "driver", "stock_keeper"]);
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isFinite(productId) || productId < 1) {
      throw new ValidationError("معرِّف المنتج غير صحيح");
    }
    const product = await withRead(undefined, (db) => getProductById(db, productId));
    return await jsonWithUnreadCount({ product }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    // Stock keepers can update stock + catalog flags but not prices — enforced via
    // a narrower patch in Phase 3 when we add per-field RBAC. Phase 2c allows
    // pm/gm/manager/stock_keeper to edit; sellers cannot.
    const claims = await requireRole(request, ["pm", "gm", "manager", "stock_keeper"]);
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isFinite(productId) || productId < 1) {
      throw new ValidationError("معرِّف المنتج غير صحيح");
    }
    const body = await request.json().catch(() => null);
    const parsed = UpdateProductPatch.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const product = await withTxInRoute(undefined, (tx) =>
      updateProduct(tx, productId, parsed.data, claims.username),
    );
    return await jsonWithUnreadCount({ product }, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
