import { describe, expect, it } from "vitest";

// Pricing helpers that don't require DB are covered by fast unit tests here.
// The DB-bound pieces (processOrderItem, loadPricingContext, buildCommissionSnapshot)
// are exercised end-to-end by tests/integration/phase-3.1-order-rules.test.ts.

import { CreateOrderItemInput } from "./dto";

describe("CreateOrderItemInput (Phase 3.1 discount fields)", () => {
  it("accepts minimal item (no discount)", () => {
    expect(
      CreateOrderItemInput.safeParse({ productId: 1, quantity: 1, unitPrice: 100 }).success,
    ).toBe(true);
  });

  it("accepts percent discount in [0, 100]", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 100,
        discountType: "percent",
        discountValue: 5,
      }).success,
    ).toBe(true);
  });

  it("rejects percent discount > 100", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 100,
        discountType: "percent",
        discountValue: 101,
      }).success,
    ).toBe(false);
  });

  it("rejects percent discount < 0 (base schema.min(0))", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 100,
        discountType: "percent",
        discountValue: -1,
      }).success,
    ).toBe(false);
  });

  it("accepts fixed discount any non-negative number", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 100,
        discountType: "fixed",
        discountValue: 25,
      }).success,
    ).toBe(true);
  });

  it("rejects discountType without discountValue", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 100,
        discountType: "percent",
      }).success,
    ).toBe(false);
  });

  it("rejects discountValue without discountType", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 100,
        discountValue: 10,
      }).success,
    ).toBe(false);
  });

  it("accepts gift item with unitPrice=0", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 0,
        isGift: true,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid discountType enum value", () => {
    expect(
      CreateOrderItemInput.safeParse({
        productId: 1,
        quantity: 1,
        unitPrice: 100,
        discountType: "ratio",
        discountValue: 0.1,
      }).success,
    ).toBe(false);
  });
});
