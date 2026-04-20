import { inArray } from "drizzle-orm";
import { withRead } from "@/db/client";
import { settings } from "@/db/schema";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { getInvoiceById } from "@/modules/invoices/service";
import { renderInvoicePdf, type InvoiceSettings } from "@/modules/invoices/pdf";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/invoices/[id]/pdf — renders the frozen invoice + lines into a
// PDF buffer and streams it back as application/pdf. Read-path only: no live
// table reads beyond settings (for the vendor block) + the frozen invoice/
// lines tables.

const SETTINGS_KEYS = [
  "shop_name",
  "shop_legal_form",
  "shop_siret",
  "shop_siren",
  "shop_ape",
  "shop_vat_number",
  "shop_address",
  "shop_city",
  "shop_email",
  "shop_website",
  "shop_iban",
  "shop_bic",
  "shop_capital_social",
  "shop_rcs_city",
  "shop_rcs_number",
  "shop_penalty_rate_annual",
  "shop_recovery_fee_eur",
];

function mapSettings(rows: Array<{ key: string; value: string }>): InvoiceSettings {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const g = (k: string): string => m.get(k) ?? "";
  return {
    shopName: g("shop_name"),
    shopLegalForm: g("shop_legal_form"),
    shopSiret: g("shop_siret"),
    shopSiren: g("shop_siren"),
    shopApe: g("shop_ape"),
    shopVatNumber: g("shop_vat_number"),
    shopAddress: g("shop_address"),
    shopCity: g("shop_city"),
    shopEmail: g("shop_email"),
    shopWebsite: g("shop_website"),
    shopIban: g("shop_iban"),
    shopBic: g("shop_bic"),
    shopCapitalSocial: g("shop_capital_social"),
    shopRcsCity: g("shop_rcs_city"),
    shopRcsNumber: g("shop_rcs_number"),
    shopPenaltyRateAnnual: g("shop_penalty_rate_annual"),
    shopRecoveryFeeEur: g("shop_recovery_fee_eur"),
  };
}

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

    const { detail, invoiceSettings } = await withRead(undefined, async (db) => {
      const detailInner = await getInvoiceById(db, invoiceId, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      });
      const rows = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(inArray(settings.key, SETTINGS_KEYS));
      return { detail: detailInner, invoiceSettings: mapSettings(rows) };
    });

    const pdfBuffer = await renderInvoicePdf(detail, invoiceSettings);

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
