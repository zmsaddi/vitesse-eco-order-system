import type { Role } from "@/lib/session-claims";
import type { OrderDto, OrderItemDto } from "./dto";

// Phase 3.1.2 response-surface redaction for 16_Data_Visibility compliance.
//
// cost_price (order_items.costPrice snapshot of product.buyPrice) is visible
// to pm/gm/manager only. seller + driver + stock_keeper must not see it.
//
// Applied at the ROUTE boundary (not the mapper) so internal callers keep the
// full DTO, and only the wire-level response is sanitized. The idempotency
// wrapper stores the redacted body, so cached replays don't leak either.

const ROLES_WITHOUT_COST_VIEW: ReadonlySet<Role> = new Set<Role>([
  "seller",
  "driver",
  "stock_keeper",
]);

export function redactOrderForRole(order: OrderDto, role: Role): OrderDto {
  if (!ROLES_WITHOUT_COST_VIEW.has(role)) return order;
  return {
    ...order,
    items: order.items.map(redactItemForRole),
  };
}

function redactItemForRole(item: OrderItemDto): OrderItemDto {
  // Structured omit — no `delete` so the type stays literal.
  const { costPrice: _costPrice, ...rest } = item;
  return rest as OrderItemDto;
}

export function redactOrdersForRole(orders: OrderDto[], role: Role): OrderDto[] {
  if (!ROLES_WITHOUT_COST_VIEW.has(role)) return orders;
  return orders.map((o) => redactOrderForRole(o, role));
}
