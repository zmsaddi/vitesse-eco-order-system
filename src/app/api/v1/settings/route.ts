import { NextResponse } from "next/server";
import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { getAllSettings, getInvoiceReadiness, updateSettings } from "@/modules/settings/service";
import { SettingsPatch } from "@/modules/settings/dto";

// GET /api/v1/settings — pm/gm read. Returns the full settings map
// (canonical keys guaranteed present, empty string when no row).
// PUT /api/v1/settings — pm/gm bulk upsert. Body is a partial record of keys.
// Response also includes invoice-readiness flag (D-35) so the UI can block
// "generate invoice" until mandatory mentions are filled.

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["pm", "gm"]);
    const [settings, readiness] = await Promise.all([
      withRead(undefined, (db) => getAllSettings(db)),
      withRead(undefined, (db) => getInvoiceReadiness(db)),
    ]);
    return NextResponse.json({ settings, invoiceReadiness: readiness });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const body = await request.json().catch(() => null);
    const parsed = SettingsPatch.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة (مفاتيح أو قيم).", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await withTxInRoute(undefined, (tx) =>
      updateSettings(tx, parsed.data, claims.username),
    );
    const readiness = await withRead(undefined, (db) => getInvoiceReadiness(db));
    return NextResponse.json({ settings: updated, invoiceReadiness: readiness });
  } catch (err) {
    return apiError(err);
  }
}
