import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { IssueAvoirInput } from "@/modules/invoices/dto";
import { performIssueAvoir } from "@/modules/invoices/avoir/issue";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Phase 4.5 — POST /api/v1/invoices/[id]/avoir.
// Roles: pm, gm only (enforced at route AND service layers).
// Idempotency-Key: required (D-79; avoir is a money-affecting mutation).
// Body:
//   { reason: string (1..2048), lines: [{ invoiceLineId, quantityToCredit }] }
// Returns:
//   { avoir: InvoiceDto, lines: InvoiceLineDto[], parentInvoiceId, parentRefCode }

export async function POST(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const { id } = await params;
    const parentInvoiceId = Number(id);
    if (!Number.isFinite(parentInvoiceId) || parentInvoiceId < 1) {
      throw new ValidationError("معرِّف الفاتورة غير صحيح");
    }
    const body = await request.json().catch(() => null);
    const parsed = IssueAvoirInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/invoices/[id]/avoir",
        username: claims.username,
        userId: claims.userId,
        body: { parentInvoiceId, ...parsed.data },
        requireHeader: "required",
      },
      async (tx) => {
        const result = await performIssueAvoir(
          tx,
          parentInvoiceId,
          parsed.data,
          {
            userId: claims.userId,
            username: claims.username,
            role: claims.role,
          },
        );
        return { status: 200, body: result };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
