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
  commissionRuleSnapshot: { source: "default" },
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

describe("redactOrderForRole (Phase 3.1.2)", () => {
  it("pm sees costPrice intact", () => {
    const out = redactOrderForRole(baseOrder, "pm");
    expect(out.items[0].costPrice).toBe(50);
  });

  it("gm sees costPrice intact", () => {
    const out = redactOrderForRole(baseOrder, "gm");
    expect(out.items[0].costPrice).toBe(50);
  });

  it("manager sees costPrice intact", () => {
    const out = redactOrderForRole(baseOrder, "manager");
    expect(out.items[0].costPrice).toBe(50);
  });

  it("seller does NOT see costPrice", () => {
    const out = redactOrderForRole(baseOrder, "seller");
    expect(out.items[0].costPrice).toBeUndefined();
    expect("costPrice" in out.items[0]).toBe(false);
  });

  it("driver does NOT see costPrice", () => {
    const out = redactOrderForRole(baseOrder, "driver");
    expect(out.items[0].costPrice).toBeUndefined();
  });

  it("stock_keeper does NOT see costPrice", () => {
    const out = redactOrderForRole(baseOrder, "stock_keeper");
    expect(out.items[0].costPrice).toBeUndefined();
  });

  it("seller still sees unitPrice, recommendedPrice, commissionRuleSnapshot", () => {
    const out = redactOrderForRole(baseOrder, "seller");
    expect(out.items[0].unitPrice).toBe(100);
    expect(out.items[0].recommendedPrice).toBe(100);
    expect(out.items[0].commissionRuleSnapshot).toEqual({ source: "default" });
  });

  it("redaction is non-mutating (input object unchanged)", () => {
    const input: OrderDto = { ...baseOrder, items: [{ ...baseItem }] };
    redactOrderForRole(input, "seller");
    expect(input.items[0].costPrice).toBe(50); // original untouched
  });

  it("JSON-serialized redacted order has no 'costPrice' key for seller", () => {
    const out = redactOrderForRole(baseOrder, "seller");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("costPrice");
    expect(serialized).not.toContain('"50"');
  });
});

describe("redactOrdersForRole", () => {
  it("applies to every order in the list", () => {
    const orders = [baseOrder, { ...baseOrder, id: 2, items: [{ ...baseItem, id: 2 }] }];
    const out = redactOrdersForRole(orders, "seller");
    for (const o of out) {
      expect(o.items[0].costPrice).toBeUndefined();
    }
  });

  it("admin list: all costs preserved", () => {
    const orders = [baseOrder, { ...baseOrder, id: 2, items: [{ ...baseItem, id: 2 }] }];
    const out = redactOrdersForRole(orders, "pm");
    for (const o of out) {
      expect(o.items[0].costPrice).toBe(50);
    }
  });
});
