import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { payments, settings } from "@/db/schema";
import { BusinessRuleError } from "@/lib/api-errors";
import type { PaymentsHistory, VendorSnapshot } from "./dto";

// Phase 4.1.1 — snapshot readers used by issue.ts at invoice-issue time.
//
// The PDF renderer reads ONLY frozen columns (00_DECISIONS §PDF render), so
// these two helpers capture the live values once at issue and hand them to
// issue.ts to persist as JSONB on the invoice row.

const VENDOR_KEYS = [
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
] as const;

export type IssueSettingsRead = {
  vatRate: number;
  vendorSnapshot: VendorSnapshot;
};

/**
 * Reads every vendor-legal setting + vat_rate once and returns both the
 * numeric VAT rate (used for line-level extraction) and the full vendor
 * snapshot that the PDF renderer will use after issue. The D-35 gate has
 * already run, so missing keys here are defensive, not expected.
 */
export async function readIssueSettings(tx: DbTx): Promise<IssueSettingsRead> {
  const allKeys = [...VENDOR_KEYS, "vat_rate"] as string[];
  const rows = await tx
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, allKeys));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const vatRaw = byKey.get("vat_rate");
  if (vatRaw === undefined) {
    throw new BusinessRuleError(
      "إعداد vat_rate مفقود.",
      "D35_READINESS_INCOMPLETE",
      412,
      "settings.vat_rate missing at invoice issue — D-35 gate should have caught this",
      { missing: ["vat_rate"] },
    );
  }
  const vatRate = Number(vatRaw);
  if (!Number.isFinite(vatRate) || vatRate < 0) {
    throw new BusinessRuleError(
      `قيمة vat_rate غير صالحة (${vatRaw}).`,
      "D35_READINESS_INCOMPLETE",
      412,
      `settings.vat_rate is not a non-negative number: ${vatRaw}`,
      { key: "vat_rate", raw: vatRaw },
    );
  }

  const g = (k: string): string => byKey.get(k) ?? "";
  const vendorSnapshot: VendorSnapshot = {
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
  return { vatRate, vendorSnapshot };
}

/**
 * Reads every non-deleted payment row for the parent order at issue time
 * (confirm-delivery has already inserted today's collection, if any) and
 * returns them as an ordered array suitable for direct storage in
 * `invoices.payments_history`.
 */
export async function readPaymentsHistory(
  tx: DbTx,
  orderId: number,
): Promise<PaymentsHistory> {
  const rows = await tx
    .select({
      date: payments.date,
      amount: payments.amount,
      paymentMethod: payments.paymentMethod,
      type: payments.type,
    })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), isNull(payments.deletedAt)))
    .orderBy(asc(payments.id));
  return rows.map((r) => ({
    date: r.date,
    amount: r.amount,
    paymentMethod: r.paymentMethod,
    type: r.type,
  }));
}
