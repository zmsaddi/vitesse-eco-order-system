import { inArray } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { settings, SETTINGS_KEYS } from "@/db/schema";
import {
  INVOICE_READINESS_KEYS,
  type InvoiceReadinessDto,
  type SettingKey,
  type SettingsMapDto,
  type SettingsPatch,
} from "./dto";
import { BusinessRuleError } from "@/lib/api-errors";

// D-28: settings.key ENUM enforced by DB CHECK.
// D-35: mandatory mentions required before first invoice. Checked via
// getInvoiceReadiness() — called from invoice-creation path (Phase 3).

export async function getAllSettings(db: DbHandle): Promise<SettingsMapDto> {
  const rows = await db.select().from(settings);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  // Ensure every canonical key exists in the map (with "" default if row missing).
  for (const k of SETTINGS_KEYS) if (!(k in map)) map[k] = "";
  return map as SettingsMapDto;
}

/**
 * Upsert a batch of settings. Invalid keys are rejected at the Zod layer before
 * this is called. DB CHECK rejects anything that slips through.
 */
export async function updateSettings(
  tx: DbTx,
  patch: SettingsPatch,
  _updatedBy: string,
): Promise<SettingsMapDto> {
  void _updatedBy; // activity_log in Phase 4
  const entries = Object.entries(patch).filter(
    (e): e is [string, string] => typeof e[1] === "string",
  );
  if (entries.length === 0) return getAllSettings(tx);

  // Upsert each (key, value) pair.
  for (const [key, value] of entries) {
    await tx
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }

  return getAllSettings(tx);
}

/**
 * D-35 readiness check: are the 4 mandatory mentions populated?
 * - shop_iban: non-empty
 * - shop_bic: non-empty
 * - shop_capital_social: non-empty
 * - shop_rcs_number: non-empty
 *
 * Called from the invoice-creation path (Phase 3+). Returns a detailed shape
 * so UIs can surface exactly which fields block invoice generation.
 */
export async function getInvoiceReadiness(db: DbHandle): Promise<InvoiceReadinessDto> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, INVOICE_READINESS_KEYS as unknown as string[]));

  const values: Partial<Record<string, string>> = {};
  for (const r of rows) values[r.key] = r.value;

  const missing: SettingKey[] = [];
  for (const key of INVOICE_READINESS_KEYS) {
    const v = values[key] ?? "";
    if (!v.trim()) missing.push(key);
  }

  return { ready: missing.length === 0, missing };
}

/**
 * Assert invoice-readiness; throw a friendly error if any mandatory mention is empty.
 * Call this from invoice-generation (Phase 3+) before producing the frozen snapshot.
 */
export async function assertInvoiceReadiness(db: DbHandle): Promise<void> {
  const status = await getInvoiceReadiness(db);
  if (!status.ready) {
    throw new BusinessRuleError(
      `لا يمكن توليد فاتورة: حقول قانونية مطلوبة غير مُعبَّأة في الإعدادات (${status.missing.join("، ")}).`,
      "INVOICE_NOT_READY",
      412, // Precondition Failed
      `Invoice generation blocked — missing mandatory mentions: ${status.missing.join(", ")}`,
      { missing: status.missing },
    );
  }
}
