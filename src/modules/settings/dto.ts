import { z } from "zod";
import { SETTINGS_KEYS } from "@/db/schema";

// D-28: settings.key ENUM. Shared source of truth — same array the CHECK constraint
// uses on settings.key at the DB level. Invalid keys never reach the service.

export const SettingKey = z.enum(SETTINGS_KEYS as unknown as [string, ...string[]]);
export type SettingKey = z.infer<typeof SettingKey>;

// Map shape: partial record of all allowed keys → string values.
// Clients send whatever subset they want to update; the service validates keys.
// Zod v4: z.record(enum,…) requires ALL enum keys; partialRecord allows any subset.
export const SettingsPatch = z.partialRecord(SettingKey, z.string().max(4096));
export type SettingsPatch = z.infer<typeof SettingsPatch>;

// DTO — the "all settings" response shape. All canonical keys guaranteed present
// (service fills missing with "" default), so the strict record is correct here.
export const SettingsMapDto = z.partialRecord(SettingKey, z.string());
export type SettingsMapDto = z.infer<typeof SettingsMapDto>;

// D-35: mandatory mentions on invoices. These MUST be non-empty before invoice generation.
// When any is empty, /api/v1/invoices POST is blocked.
export const INVOICE_READINESS_KEYS = [
  "shop_iban",
  "shop_bic",
  "shop_capital_social",
  "shop_rcs_number",
] as const;
export type InvoiceReadinessKey = (typeof INVOICE_READINESS_KEYS)[number];

export const InvoiceReadinessDto = z.object({
  ready: z.boolean(),
  missing: z.array(SettingKey),
});
export type InvoiceReadinessDto = z.infer<typeof InvoiceReadinessDto>;
