import { describe, expect, it } from "vitest";
import { redactOrderForRole, redactOrdersForRole } from "./redaction";
import type { OrderDto, OrderItemDto } from "./dto";

const baseItem: OrderItemDto = {
  id: 1,
  orderId: 1,
  productId: 1,
  productNameCached: "Test Product",
  category: "إكسسوار",
  quantity: 1,
  recommendedPrice: 100,
  unitPrice: 100,
  costPrice: 50,
  discountType: null,
  discountValue: null,
  lineTotal: 100,
  isGift: false,
  vin: "",
  // Full snapshot mimicking a real commission rule with all three role axes.
  commissionRuleSnapshot: {
    source: "category_rule",
    captured_at: "2026-04-20T10:00:00.000Z",
    seller_fixed_per_unit: 25,
    seller_pct_overage: 5,
    driver_fixed_per_delivery: 15,
  },
};

const baseOrder: OrderDto = {
  id: 1,
  refCode: "ORD-20260420-00001",
  date: "2026-04-20",
  clientId: 1,
  clientNameCached: "Test Client",
  clientPhoneCached: "+33600000000",
  status: "محجوز",
  paymentMethod: "كاش",
  paymentStatus: "pending",
  totalAmount: 100,
  advancePaid: 0,
  notes: "",
  createdBy: "seller1",
  updatedBy: null,
  updatedAt: null,
  items: [baseItem],
};

describe("redactOrderForRole — costPrice rules (Phase 3.1.2)", () => {
  it("pm/gm/manager see costPrice intact", () => {
    for (const role of ["pm", "gm", "manager"] as const) {
      const out = redactOrderForRole(baseOrder, role);
      expect(out.items[0].costPrice).toBe(50);
    }
  });

  it("seller/driver/stock_keeper do NOT see costPrice", () => {
    for (const role of ["seller", "driver", "stock_keeper"] as const) {
      const out = redactOrderForRole(baseOrder, role);
      expect(out.items[0].costPrice).toBeUndefined();
      expect("costPrice" in out.items[0]).toBe(false);
    }
  });
});

describe("redactOrderForRole — commissionRuleSnapshot per-role filter (Phase 3.1.3)", () => {
  it("pm/gm/manager: full snapshot preserved (all keys)", () => {
    for (const role of ["pm", "gm", "manager"] as const) {
      const out = redactOrderForRole(baseOrder, role);
      const snap = out.items[0].commissionRuleSnapshot as Record<string, unknown>;
      expect(snap.source).toBe("category_rule");
      expect(snap.seller_fixed_per_unit).toBe(25);
      expect(snap.seller_pct_overage).toBe(5);
      expect(snap.driver_fixed_per_delivery).toBe(15);
    }
  });

  it("seller: snapshot shows only source + captured_at + seller_* fields", () => {
    const out = redactOrderForRole(baseOrder, "seller");
    const snap = out.items[0].commissionRuleSnapshot as Record<string, unknown>;
    expect(snap.source).toBe("category_rule");
    expect(snap.captured_at).toBe("2026-04-20T10:00:00.000Z");
    expect(snap.seller_fixed_per_unit).toBe(25);
    expect(snap.seller_pct_overage).toBe(5);
    // driver field MUST be absent.
    expect("driver_fixed_per_delivery" in snap).toBe(false);
  });

  it("driver: snapshot shows only source + captured_at + driver_* field", () => {
    const out = redactOrderForRole(baseOrder, "driver");
    const snap = out.items[0].commissionRuleSnapshot as Record<string, unknown>;
    expect(snap.source).toBe("category_rule");
    expect(snap.captured_at).toBe("2026-04-20T10:00:00.000Z");
    expect(snap.driver_fixed_per_delivery).toBe(15);
    // seller fields MUST be absent.
    expect("seller_fixed_per_unit" in snap).toBe(false);
    expect("seller_pct_overage" in snap).toBe(false);
  });

  it("stock_keeper: commissionRuleSnapshot is stripped entirely", () => {
    const out = redactOrderForRole(baseOrder, "stock_keeper");
    expect(out.items[0].commissionRuleSnapshot).toBeUndefined();
    expect("commissionRuleSnapshot" in out.items[0]).toBe(false);
  });

  it("JSON-serialized seller response never contains driver_fixed_per_delivery", () => {
    const out = redactOrderForRole(baseOrder, "seller");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("driver_fixed_per_delivery");
    expect(serialized).not.toContain("costPrice");
  });

  it("JSON-serialized driver response never contains seller_fixed_per_unit", () => {
    const out = redactOrderForRole(baseOrder, "driver");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("seller_fixed_per_unit");
    expect(serialized).not.toContain("seller_pct_overage");
    expect(serialized).not.toContain("costPrice");
  });

  it("JSON-serialized stock_keeper response contains no snapshot keys at all", () => {
    const out = redactOrderForRole(baseOrder, "stock_keeper");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("commissionRuleSnapshot");
    expect(serialized).not.toContain("seller_fixed_per_unit");
    expect(serialized).not.toContain("driver_fixed_per_delivery");
    expect(serialized).not.toContain("costPrice");
  });

  it("seller still sees unitPrice + recommendedPrice", () => {
    const out = redactOrderForRole(baseOrder, "seller");
    expect(out.items[0].unitPrice).toBe(100);
    expect(out.items[0].recommendedPrice).toBe(100);
  });

  it("redaction is non-mutating (input object unchanged)", () => {
    const input: OrderDto = {
      ...baseOrder,
      items: [{ ...baseItem, commissionRuleSnapshot: { ...baseItem.commissionRuleSnapshot } as Record<string, unknown> }],
    };
    redactOrderForRole(input, "seller");
    expect(input.items[0].costPrice).toBe(50);
    const origSnap = input.items[0].commissionRuleSnapshot as Record<string, unknown>;
    expect(origSnap.driver_fixed_per_delivery).toBe(15); // untouched
  });

  it("handles missing/undefined snapshot safely", () => {
    const { commissionRuleSnapshot: _omit, ...itemWithoutSnap } = baseItem;
    const order: OrderDto = { ...baseOrder, items: [itemWithoutSnap as OrderItemDto] };
    const out = redactOrderForRole(order, "seller");
    expect(out.items[0].commissionRuleSnapshot).toBeUndefined();
  });
});

describe("redactOrdersForRole", () => {
  it("applies to every order in the list (seller)", () => {
    const orders = [baseOrder, { ...baseOrder, id: 2, items: [{ ...baseItem, id: 2 }] }];
    const out = redactOrdersForRole(orders, "seller");
    for (const o of out) {
      expect(o.items[0].costPrice).toBeUndefined();
      const snap = o.items[0].commissionRuleSnapshot as Record<string, unknown>;
      expect("driver_fixed_per_delivery" in snap).toBe(false);
    }
  });

  it("applies to every order in the list (stock_keeper)", () => {
    const orders = [baseOrder, { ...baseOrder, id: 2, items: [{ ...baseItem, id: 2 }] }];
    const out = redactOrdersForRole(orders, "stock_keeper");
    for (const o of out) {
      expect(o.items[0].costPrice).toBeUndefined();
      expect(o.items[0].commissionRuleSnapshot).toBeUndefined();
    }
  });

  it("admin list: everything preserved", () => {
    const orders = [baseOrder, { ...baseOrder, id: 2, items: [{ ...baseItem, id: 2 }] }];
    const out = redactOrdersForRole(orders, "pm");
    for (const o of out) {
      expect(o.items[0].costPrice).toBe(50);
      const snap = o.items[0].commissionRuleSnapshot as Record<string, unknown>;
      expect(snap.driver_fixed_per_delivery).toBe(15);
    }
  });
});
