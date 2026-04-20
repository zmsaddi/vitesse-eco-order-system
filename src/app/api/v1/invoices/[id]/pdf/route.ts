import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { getInvoiceById } from "@/modules/invoices/service";
import { renderInvoicePdf } from "@/modules/invoices/pdf";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/invoices/[id]/pdf — stream a PDF rendered from frozen invoice
// data only. Per 00_DECISIONS §PDF render, this endpoint does NOT read
// live `settings` / live `payments`; the vendor block + payments history
// come from the invoice row's frozen JSONB columns that were populated at
// issue time.

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

    const pdfBuffer = await renderInvoicePdf(detail);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBuffer.length),
        "Content-Disposition": `inline; filename="${detail.invoice.refCode}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
