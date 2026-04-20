import { describe, expect, it } from "vitest";
import {
  CancelOrderInput,
  CreateOrderInput,
  CreateOrderItemInput,
} from "./dto";

describe("CreateOrderItemInput", () => {
  it("accepts minimal valid input", () => {
    const out = CreateOrderItemInput.safeParse({
      productId: 1,
      quantity: 2,
      unitPrice: 50,
    });
    expect(out.success).toBe(true);
  });

  it("rejects zero/negative quantity", () => {
    expect(CreateOrderItemInput.safeParse({ productId: 1, quantity: 0, unitPrice: 10 }).success).toBe(false);
    expect(CreateOrderItemInput.safeParse({ productId: 1, quantity: -1, unitPrice: 10 }).success).toBe(false);
  });
});

describe("CreateOrderInput", () => {
  it("accepts valid multi-item order", () => {
    const out = CreateOrderInput.safeParse({
      clientId: 1,
      date: "2026-04-20",
      items: [{ productId: 1, quantity: 2, unitPrice: 50 }],
    });
    expect(out.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const out = CreateOrderInput.safeParse({
      clientId: 1,
      date: "2026-04-20",
      items: [],
    });
    expect(out.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const out = CreateOrderInput.safeParse({
      clientId: 1,
      date: "20-04-2026",
      items: [{ productId: 1, quantity: 1, unitPrice: 1 }],
    });
    expect(out.success).toBe(false);
  });

  it("rejects gift item with non-zero unitPrice (refine)", () => {
    const out = CreateOrderInput.safeParse({
      clientId: 1,
      date: "2026-04-20",
      items: [{ productId: 1, quantity: 1, unitPrice: 10, isGift: true }],
    });
    expect(out.success).toBe(false);
  });

  it("accepts gift item with zero unitPrice", () => {
    const out = CreateOrderInput.safeParse({
      clientId: 1,
      date: "2026-04-20",
      items: [{ productId: 1, quantity: 1, unitPrice: 0, isGift: true }],
    });
    expect(out.success).toBe(true);
  });
});

describe("CancelOrderInput", () => {
  it("accepts all three bonus action choices", () => {
    for (const action of ["keep", "cancel_unpaid", "cancel_as_debt"] as const) {
      const out = CancelOrderInput.safeParse({
        reason: "سبب الإلغاء",
        returnToStock: true,
        sellerBonusAction: action,
        driverBonusAction: action,
      });
      expect(out.success).toBe(true);
    }
  });

  it("rejects invalid bonus action enum", () => {
    const out = CancelOrderInput.safeParse({
      reason: "x",
      returnToStock: true,
      sellerBonusAction: "bogus",
      driverBonusAction: "keep",
    });
    expect(out.success).toBe(false);
  });

  it("rejects empty reason (BR-17)", () => {
    const out = CancelOrderInput.safeParse({
      reason: "",
      returnToStock: true,
      sellerBonusAction: "keep",
      driverBonusAction: "keep",
    });
    expect(out.success).toBe(false);
  });
});
