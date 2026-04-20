import { describe, expect, it } from "vitest";
import { ConfirmDeliveryInput, CreateDeliveryInput } from "./dto";

describe("CreateDeliveryInput (Phase 4.0)", () => {
  it("accepts minimal input (orderId only)", () => {
    const out = CreateDeliveryInput.safeParse({ orderId: 1 });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.assignedDriverId).toBeNull();
      expect(out.data.notes).toBe("");
    }
  });

  it("accepts assignedDriverId + notes", () => {
    const out = CreateDeliveryInput.safeParse({
      orderId: 5,
      assignedDriverId: 9,
      notes: "تسليم سريع",
    });
    expect(out.success).toBe(true);
  });

  it("rejects orderId = 0", () => {
    expect(CreateDeliveryInput.safeParse({ orderId: 0 }).success).toBe(false);
  });

  it("rejects negative assignedDriverId", () => {
    expect(
      CreateDeliveryInput.safeParse({ orderId: 1, assignedDriverId: -1 }).success,
    ).toBe(false);
  });
});

describe("ConfirmDeliveryInput (Phase 4.0)", () => {
  it("accepts empty body (credit sale — paid=0)", () => {
    const out = ConfirmDeliveryInput.safeParse({});
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.paidAmount).toBe(0);
  });

  it("accepts paid amount + payment method", () => {
    const out = ConfirmDeliveryInput.safeParse({
      paidAmount: 250,
      paymentMethod: "كاش",
      notes: "تحصيل كامل",
    });
    expect(out.success).toBe(true);
  });

  it("rejects negative paid amount", () => {
    expect(
      ConfirmDeliveryInput.safeParse({ paidAmount: -50 }).success,
    ).toBe(false);
  });

  it("rejects invalid payment method", () => {
    expect(
      ConfirmDeliveryInput.safeParse({ paymentMethod: "بطاقة" }).success,
    ).toBe(false);
  });

  it("accepts all three supported payment methods", () => {
    for (const method of ["كاش", "بنك", "آجل"] as const) {
      expect(
        ConfirmDeliveryInput.safeParse({ paymentMethod: method }).success,
      ).toBe(true);
    }
  });
});
