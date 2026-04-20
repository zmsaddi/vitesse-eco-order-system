import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { getOrderById } from "@/modules/orders/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/orders/[id] — read order with items.
// Read-only; all authenticated roles can fetch (visibility filtering is Phase 3.x).

export async function GET(request: Request, { params }: Params) {
  try {
    await requireRole(request, [
      "pm",
      "gm",
      "manager",
      "seller",
      "driver",
      "stock_keeper",
    ]);
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId < 1) {
      throw new ValidationError("معرِّف الطلب غير صحيح");
    }
    const order = await withRead(undefined, (db) => getOrderById(db, orderId));
    return NextResponse.json({ order });
  } catch (err) {
    return apiError(err);
  }
}
