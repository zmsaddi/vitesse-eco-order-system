import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { withIdempotencyRoute } from "@/lib/idempotency";
import {
  CreateDeliveryInput,
  ListDeliveriesQuery,
} from "@/modules/deliveries/dto";
import {
  createDelivery,
  listDeliveries,
} from "@/modules/deliveries/service";

export const runtime = "nodejs";

// Phase 6.4 — GET /api/v1/deliveries — paginated read-only list with role-
// scoped filtering. Scope matches Phase 4.0 `enforceDeliveryVisibility`:
// pm/gm/manager see all; driver sees only own (delegated to
// listDeliveriesForDriver); seller/stock_keeper → 403.

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "driver"]);
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ListDeliveriesQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await withRead(undefined, (db) =>
      listDeliveries(
        db,
        {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        },
        parsed.data,
      ),
    );
    return await jsonWithUnreadCount(
      { deliveries: result.rows, total: result.total },
      200,
      claims.userId,
    );
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/v1/deliveries — create a delivery record from an order currently
// in status "جاهز". pm/gm/manager only (driver cannot create their own).
// Idempotency: 'optional' (matches POST /orders pattern; safe to retry).

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const body = await request.json().catch(() => null);
    const parsed = CreateDeliveryInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/deliveries",
        username: claims.username,
        userId: claims.userId,
        body: parsed.data,
        requireHeader: "optional",
      },
      async (tx) => {
        const delivery = await createDelivery(tx, parsed.data, {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        });
        return { status: 201, body: { delivery } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
