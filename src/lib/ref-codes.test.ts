import { describe, expect, it } from "vitest";
import { deliveryRef, invoiceRef, orderRef, purchaseRef } from "./ref-codes";

describe("ref-codes.orderRef", () => {
  it("matches ORD-YYYYMMDD-NNNNN", () => {
    const ref = orderRef(42);
    expect(ref).toMatch(/^ORD-\d{8}-00042$/);
  });

  it("zero-pads to 5 digits", () => {
    expect(orderRef(1)).toMatch(/-00001$/);
    expect(orderRef(99999)).toMatch(/-99999$/);
  });
});

describe("ref-codes.purchaseRef", () => {
  it("matches PU-YYYYMMDD-NNNNN", () => {
    expect(purchaseRef(7)).toMatch(/^PU-\d{8}-00007$/);
  });
});

describe("ref-codes.deliveryRef", () => {
  it("matches DL-YYYYMMDD-NNNNN", () => {
    expect(deliveryRef(123)).toMatch(/^DL-\d{8}-00123$/);
  });
});

describe("ref-codes.invoiceRef", () => {
  it("matches FAC-YYYY-MM-NNNN (D-01)", () => {
    expect(invoiceRef(2026, 4, 17)).toBe("FAC-2026-04-0017");
    expect(invoiceRef(2026, 12, 9999)).toBe("FAC-2026-12-9999");
  });

  it("zero-pads month + sequence", () => {
    expect(invoiceRef(2026, 1, 1)).toBe("FAC-2026-01-0001");
  });
});
