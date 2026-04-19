import type { DbTx } from "./client";
import { permissions, settings } from "./schema";
import type { Role } from "@/lib/session-claims";

// Permission matrix seed — مستمد من docs/requirements-analysis/15_Roles_Permissions.md.
// يُطبَّق يدوياً عبر /api/init (first-run) أو cron seed command.
// D-12: PM is sole owner of /permissions mutations; GM read-only.

type Perm = { role: Role; resource: string; action: string; allowed: boolean };

// Helper: expand a set of actions for multiple roles quickly.
function grant(rolesList: Role[], resource: string, actions: string[]): Perm[] {
  return rolesList.flatMap((role) =>
    actions.map((action) => ({ role, resource, action, allowed: true })),
  );
}

// ═══════════════════════════════════════════════════════════
// Permission matrix (D-12) — default deny; only allowed entries seeded.
// ═══════════════════════════════════════════════════════════
export const PERMISSION_SEED: Perm[] = [
  // Orders
  ...grant(["pm", "gm", "manager"], "orders", ["view", "create", "edit", "cancel", "collect"]),
  ...grant(["seller"], "orders", ["view_own", "create", "collect"]),
  ...grant(["driver"], "orders", ["view_assigned", "collect"]),
  ...grant(["stock_keeper"], "orders", ["view", "start_preparation"]),

  // Clients
  ...grant(["pm", "gm", "manager"], "clients", ["view", "create", "edit"]),
  ...grant(["seller"], "clients", ["view", "create"]),

  // Suppliers
  ...grant(["pm", "gm", "manager"], "suppliers", ["view", "create", "edit"]),
  ...grant(["stock_keeper"], "suppliers", ["view"]),

  // Products
  ...grant(["pm", "gm", "manager", "stock_keeper"], "products", ["view", "create", "edit"]),
  ...grant(["seller", "driver"], "products", ["view"]),

  // Deliveries
  ...grant(["pm", "gm", "manager"], "deliveries", ["view", "assign", "edit"]),
  ...grant(["driver"], "deliveries", ["view_assigned", "confirm"]),

  // Invoices
  ...grant(["pm", "gm", "manager"], "invoices", ["view", "generate"]),
  ...grant(["pm", "gm"], "invoices", ["avoir"]),
  ...grant(["seller"], "invoices", ["view_own"]),

  // Treasury
  ...grant(["pm", "gm"], "treasury", ["view_all", "transfer", "reconcile"]),
  ...grant(["manager"], "treasury", ["view_own_box", "reconcile"]),
  ...grant(["driver"], "treasury", ["view_own_custody", "handover"]),

  // Settlements + distributions
  ...grant(["pm", "gm"], "settlements", ["view", "create"]),
  ...grant(["manager"], "settlements", ["view_team"]),
  ...grant(["pm", "gm"], "distributions", ["view", "create"]),

  // Activity log (D-12 + RGPD)
  ...grant(["pm", "gm"], "activity", ["view_all"]),
  ...grant(["manager"], "activity", ["view_team"]),

  // Permissions — D-12: PM only mutates; GM read.
  { role: "pm", resource: "permissions", action: "view", allowed: true },
  { role: "pm", resource: "permissions", action: "edit", allowed: true },
  { role: "gm", resource: "permissions", action: "view", allowed: true },

  // Settings
  ...grant(["pm", "gm"], "settings", ["view", "edit"]),

  // Voice (D-31..D-34 + D-73)
  ...grant(["pm", "gm", "manager", "seller"], "voice", ["use"]),

  // Dashboard — D-72: admin roles get action-hub + full dashboard access; operational don't
  ...grant(["pm", "gm", "manager"], "dashboard", ["view"]),
];

// ═══════════════════════════════════════════════════════════
// Settings seed — D-28 ENUM + D-35 mandatory mention placeholders.
// Placeholders MUST be filled before first invoice generation (D-35).
// ═══════════════════════════════════════════════════════════
export const SETTINGS_SEED = [
  { key: "shop_name", value: "VITESSE ECO SAS" },
  { key: "shop_legal_form", value: "SAS" },
  { key: "shop_siren", value: "100 732 247" },
  { key: "shop_siret", value: "100 732 247 00018" },
  { key: "shop_ape", value: "46.90Z" },
  { key: "shop_vat_number", value: "FR43100732247" },
  { key: "shop_address", value: "32 Rue du Faubourg du Pont Neuf" },
  { key: "shop_city", value: "86000 Poitiers, France" },
  { key: "shop_email", value: "contact@vitesse-eco.fr" },
  { key: "shop_website", value: "www.vitesse-eco.fr" },
  { key: "shop_iban", value: "" }, // D-35 — blocks invoice generation until filled
  { key: "shop_bic", value: "" },
  { key: "shop_capital_social", value: "" }, // D-35 — SAS mandatory
  { key: "shop_rcs_city", value: "Poitiers" },
  { key: "shop_rcs_number", value: "" }, // D-35
  { key: "shop_penalty_rate_annual", value: "10.5" },
  { key: "shop_recovery_fee_eur", value: "40" },
  { key: "vat_rate", value: "20" },
  { key: "invoice_currency", value: "EUR" },
  { key: "seller_bonus_fixed", value: "10" },
  { key: "seller_bonus_percentage", value: "40" },
  { key: "driver_bonus_fixed", value: "10" },
  { key: "max_discount_seller_pct", value: "5" },
  { key: "max_discount_manager_pct", value: "15" },
  { key: "vin_required_categories", value: '["دراجات كهربائية","دراجات عادية"]' },
  { key: "driver_custody_cap_eur", value: "2000" },
  { key: "sku_limit", value: "500" },
  { key: "max_images_per_product", value: "3" },
  { key: "voice_rate_limit_per_min", value: "10" },
  { key: "voice_max_audio_seconds", value: "30" },
  { key: "voice_min_audio_ms", value: "1500" },
  { key: "auto_refresh_interval_ms", value: "90000" },
  { key: "activity_log_retention_days", value: "90" },
  { key: "voice_logs_retention_days", value: "30" },
  { key: "read_notifications_retention_days", value: "60" },
  { key: "neon_hours_used_this_month", value: "0" },
] as const;

// ═══════════════════════════════════════════════════════════
// Apply seeds inside a caller-supplied transaction.
// ═══════════════════════════════════════════════════════════

export async function seedPermissions(tx: DbTx): Promise<number> {
  let count = 0;
  for (const p of PERMISSION_SEED) {
    await tx
      .insert(permissions)
      .values(p)
      .onConflictDoNothing({
        target: [permissions.role, permissions.resource, permissions.action],
      });
    count++;
  }
  return count;
}

export async function seedSettings(tx: DbTx): Promise<number> {
  let count = 0;
  for (const s of SETTINGS_SEED) {
    await tx.insert(settings).values(s).onConflictDoNothing({ target: settings.key });
    count++;
  }
  return count;
}
