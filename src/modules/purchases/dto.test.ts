import { describe, expect, it } from "vitest";
import { CreatePurchaseInput, ReversePurchaseInput } from "./dto";

describe("CreatePurchaseInput", () => {
  it("accepts valid input", () => {
    const out = CreatePurchaseInput.safeParse({
      date: "2026-04-20",
      supplierId: 1,
      productId: 2,
      quantity: 10,
      unitPrice: 50,
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.paidAmount).toBe(0);
      expect(out.data.paymentMethod).toBe("كاش");
    }
  });

  it("rejects zero/negative quantity", () => {
    expect(CreatePurchaseInput.safeParse({
      date: "2026-04-20",
      supplierId: 1,
      productId: 2,
      quantity: 0,
      unitPrice: 50,
    }).success).toBe(false);
  });

  it("rejects negative unit price", () => {
    expect(CreatePurchaseInput.safeParse({
      date: "2026-04-20",
      supplierId: 1,
      productId: 2,
      quantity: 1,
      unitPrice: -1,
    }).success).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(CreatePurchaseInput.safeParse({
      date: "bad-date",
      supplierId: 1,
      productId: 2,
      quantity: 1,
      unitPrice: 1,
    }).success).toBe(false);
  });
});

describe("ReversePurchaseInput", () => {
  it("accepts refund_cash path", () => {
    const out = ReversePurchaseInput.safeParse({
      reason: "تالف",
      reversalPath: "refund_cash",
    });
    expect(out.success).toBe(true);
  });

  it("accepts supplier_credit path", () => {
    const out = ReversePurchaseInput.safeParse({
      reason: "مرتجع",
      reversalPath: "supplier_credit",
    });
    expect(out.success).toBe(true);
  });

  it("rejects unknown reversalPath", () => {
    const out = ReversePurchaseInput.safeParse({
      reason: "x",
      reversalPath: "other",
    });
    expect(out.success).toBe(false);
  });

  it("rejects empty reason", () => {
    const out = ReversePurchaseInput.safeParse({
      reason: "",
      reversalPath: "refund_cash",
    });
    expect(out.success).toBe(false);
  });
});
