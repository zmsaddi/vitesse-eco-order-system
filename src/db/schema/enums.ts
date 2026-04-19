// Canonical enum values used across multiple schema files.
// Drizzle CHECK constraints use these arrays directly in table builders.

export const ROLES = ["pm", "gm", "manager", "seller", "driver", "stock_keeper"] as const;
export type RoleEnum = (typeof ROLES)[number];

export const ORDER_STATUSES = ["محجوز", "قيد التحضير", "جاهز", "مؤكد", "ملغي"] as const;
export const PAYMENT_STATUSES = ["pending", "partial", "paid", "cancelled"] as const;
export const DELIVERY_STATUSES = [
  "قيد الانتظار",
  "قيد التحضير",
  "جاهز",
  "جاري التوصيل",
  "تم التوصيل",
  "ملغي",
] as const;

export const PAYMENT_METHODS = ["كاش", "بنك", "آجل"] as const;
export const PAYMENT_TYPES = ["collection", "refund", "advance"] as const;

export const DRIVER_TASK_TYPES = ["delivery", "supplier_pickup", "collection"] as const;

export const TREASURY_CATEGORIES = [
  "sale_collection",
  "supplier_payment",
  "expense",
  "settlement",
  "reward",
  "profit_distribution",
  "driver_handover",
  "manager_settlement",
  "funding",
  "bank_deposit",
  "bank_withdrawal",
  "refund",
  "reconciliation",
] as const;

export const TREASURY_ACCOUNT_TYPES = [
  "main_cash",
  "main_bank",
  "manager_box",
  "driver_custody",
] as const;

export const DISCOUNT_TYPES = ["percent", "fixed"] as const;

export const BONUS_ACTIONS = ["keep", "cancel_as_debt", "cancel_unpaid"] as const;

export const ACTIVITY_ACTIONS = [
  "create",
  "update",
  "delete",
  "cancel",
  "confirm",
  "collect",
  "login",
  "logout",
] as const;

export const VOICE_LOG_STATUSES = [
  "pending",
  "processed",
  "saved",
  "abandoned",
  "edited_and_saved",
  "groq_error",
] as const;

// D-28: canonical list of allowed settings keys.
export const SETTINGS_KEYS = [
  "shop_name",
  "shop_legal_form",
  "shop_siren",
  "shop_siret",
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
  "vat_rate",
  "invoice_currency",
  "seller_bonus_fixed",
  "seller_bonus_percentage",
  "driver_bonus_fixed",
  "max_discount_seller_pct",
  "max_discount_manager_pct",
  "vin_required_categories",
  "driver_custody_cap_eur",
  "sku_limit",
  "max_images_per_product",
  "voice_rate_limit_per_min",
  "voice_max_audio_seconds",
  "voice_min_audio_ms",
  "auto_refresh_interval_ms",
  "activity_log_retention_days",
  "voice_logs_retention_days",
  "read_notifications_retention_days",
  "neon_hours_used_this_month",
] as const;
