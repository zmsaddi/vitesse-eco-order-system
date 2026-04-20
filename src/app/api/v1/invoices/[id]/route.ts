import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { getInvoiceById } from "@/modules/invoices/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/invoices/[id] — invoice header + lines.
// Visibility enforced inside the service via enforceInvoiceVisibility.

export async function GET(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, [
      "pm",
      "gm",
      "manager",
      "seller",
      "driver",
    ]);
    const { id } = await params;
    const invoiceId = Number(id);
    if (!Number.isFinite(invoiceId) || invoiceId < 1) {
      throw new ValidationError("معرِّف الفاتورة غير صحيح");
    }
    const detail = await withRead(undefined, (db) =>
      getInvoiceById(db, invoiceId, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return NextResponse.json(detail);
  } catch (err) {
    return apiError(err);
  }
}
