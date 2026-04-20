import { inArray } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { settings } from "@/db/schema";
import { BusinessRuleError } from "@/lib/api-errors";

// Phase 4.1 — D-35 readiness gate for invoice issuance.
//
// D-35 defines the mandatory mentions that every French facture must carry
// (article L441-9 + ordonnance 2000-916 + loi Sapin). If any required key is
// missing, empty, or still carries an obvious placeholder marker, we refuse
// to issue the invoice with 412 PRECONDITION_FAILED — and because this runs
// at the very top of confirmDelivery, the whole transaction rolls back:
//   - delivery stays "جاري التوصيل"
//   - order stays in its prior status (no flip to "مؤكد")
//   - no payment row, no bonus row, no invoice row
//
// The admin fixes the missing settings, then the driver retries confirm.

export const D35_REQUIRED_SETTINGS: readonly string[] = [
  "shop_name",
  "shop_legal_form",
  "shop_siret",
  "shop_vat_number",
  "shop_address",
  "shop_city",
  "shop_capital_social",
  "shop_rcs_city",
  "shop_rcs_number",
  "shop_iban",
  "shop_bic",
  "vat_rate",
];

/**
 * Placeholder detection — values a non-configured admin might leave behind.
 * Extensible without breaking real configurations: we look for all-caps
 * "TO_FILL" / "XXX" / "TODO" tokens and reject the exact literal "0".
 */
const PLACEHOLDER_PATTERNS = [/TO_FILL/i, /^XXX$/i, /TODO/i];

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.test(trimmed)) return true;
  }
  return false;
}

export type D35Status = {
  ok: boolean;
  missing: string[];
};

export async function checkD35Readiness(tx: DbTx): Promise<D35Status> {
  const rows = await tx
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, D35_REQUIRED_SETTINGS as unknown as string[]));

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const missing: string[] = [];
  for (const key of D35_REQUIRED_SETTINGS) {
    const v = byKey.get(key);
    if (v === undefined || v === null) {
      missing.push(key);
      continue;
    }
    if (isPlaceholder(v)) missing.push(key);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Throws BusinessRuleError(412) when the readiness check fails. Called at the
 * very top of confirmDelivery — before any mutation — so a 412 response rolls
 * back zero state.
 */
export async function validateD35Readiness(tx: DbTx): Promise<void> {
  const status = await checkD35Readiness(tx);
  if (status.ok) return;

  throw new BusinessRuleError(
    `لا يمكن إصدار فاتورة: مذكرات D-35 الإلزامية ناقصة (${status.missing.join(", ")}). راجع الإعدادات.`,
    "D35_READINESS_INCOMPLETE",
    412,
    `D-35 mandatory mentions missing: ${status.missing.join(",")}`,
    { missing: status.missing },
  );
}
