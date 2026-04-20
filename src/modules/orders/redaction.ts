import type { Role } from "@/lib/session-claims";
import type { OrderDto, OrderItemDto } from "./dto";

// Phase 3.1.2 + 3.1.3 response-surface redaction for 16_Data_Visibility compliance.
//
// Two kinds of field-level leaks are closed here:
//   1. cost_price (order_items.costPrice snapshot of product.buyPrice) is visible
//      to pm/gm/manager only. seller + driver + stock_keeper must not see it.
//   2. commissionRuleSnapshot is a JSONB that includes OTHER people's commission
//      rates (e.g. driver_fixed_per_delivery is visible to the seller in the raw
//      snapshot). Per 15_Roles_Permissions + 16_Data_Visibility, each restricted
//      role may see ONLY their own commission metadata:
//        - seller → { source, captured_at, seller_fixed_per_unit, seller_pct_overage }
//        - driver → { source, captured_at, driver_fixed_per_delivery }
//        - stock_keeper → snapshot stripped entirely (no commission standing)
//        - pm/gm/manager → full snapshot retained
//
// Applied at the ROUTE boundary (not the mapper) so internal callers keep the
// full DTO; only the wire-level response is sanitized. Idempotency-cached
// replays are also sanitized because the redacted body is what gets stored.

const ROLES_WITHOUT_COST_VIEW: ReadonlySet<Role> = new Set<Role>([
  "seller",
  "driver",
  "stock_keeper",
]);

const SELLER_SNAPSHOT_KEYS = [
  "source",
  "captured_at",
  "seller_fixed_per_unit",
  "seller_pct_overage",
] as const;

const DRIVER_SNAPSHOT_KEYS = [
  "source",
  "captured_at",
  "driver_fixed_per_delivery",
] as const;

export function redactOrderForRole(order: OrderDto, role: Role): OrderDto {
  // pm/gm/manager — full visibility, no copy needed.
  if (!ROLES_WITHOUT_COST_VIEW.has(role)) return order;
  return {
    ...order,
    items: order.items.map((item) => redactItemForRole(item, role)),
  };
}

function redactItemForRole(item: OrderItemDto, role: Role): OrderItemDto {
  // Drop costPrice for all restricted roles.
  const { costPrice: _costPrice, commissionRuleSnapshot: fullSnap, ...rest } = item;
  const filteredSnap = filterSnapshotForRole(fullSnap, role);
  const result: OrderItemDto = { ...rest } as OrderItemDto;
  if (filteredSnap !== undefined) {
    result.commissionRuleSnapshot = filteredSnap;
  }
  return result;
}

function filterSnapshotForRole(
  snapshot: Record<string, unknown> | undefined,
  role: Role,
): Record<string, unknown> | undefined {
  if (!snapshot) return undefined;
  if (role === "stock_keeper") return undefined; // no commission standing
  const allowed =
    role === "seller"
      ? SELLER_SNAPSHOT_KEYS
      : role === "driver"
      ? DRIVER_SNAPSHOT_KEYS
      : null;
  if (!allowed) return snapshot; // pm/gm/manager (shouldn't reach here)
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in snapshot) out[key] = snapshot[key];
  }
  return out;
}

export function redactOrdersForRole(orders: OrderDto[], role: Role): OrderDto[] {
  if (!ROLES_WITHOUT_COST_VIEW.has(role)) return orders;
  return orders.map((o) => redactOrderForRole(o, role));
}
