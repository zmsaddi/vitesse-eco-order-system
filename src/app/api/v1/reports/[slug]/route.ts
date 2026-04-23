import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { ReportQuery } from "@/modules/reports/dto";
import { runReport } from "@/modules/reports/service";

export const runtime = "nodejs";

// GET /api/v1/reports/[slug] — read-only report.
// Route-layer role gate: pm/gm/manager. Slug-level permission happens inside
// service.ts (REPORT_REGISTRY + assertRoleCanRunReport), so a manager asking
// for a pm/gm-only slug → 403 from the service layer; an unknown slug →
// 404 REPORT_NOT_FOUND from assertSlugExists.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const { slug } = await params;
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ReportQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const out = await withRead(undefined, (db) =>
      runReport(db, slug, parsed.data, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return await jsonWithUnreadCount(out, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
