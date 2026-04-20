import { describe, expect, it } from "vitest";
import { __test__ } from "./bonuses";

const { computeSellerItemBonus, round2, snapshotNumber } = __test__;

// Pure bonus-math unit tests — no DB. The full insert path is covered by
// tests/integration/phase-4.0-deliveries.test.ts via a real confirm-delivery.

describe("round2", () => {
  it("rounds to 2 decimals (Math.round semantics)", () => {
    // JS Math.round half-to-even quirk: 1.005 × 100 = 100.49999... → 100. Accepted
    // because the spec only demands round2 consistency, not IEEE-754-free math.
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(99.999)).toBe(100);
    expect(round2(100.114)).toBe(100.11);
    expect(round2(100.116)).toBe(100.12);
  });
});

describe("snapshotNumber", () => {
  it("reads numeric keys from snapshot", () => {
    expect(
      snapshotNumber({ seller_fixed_per_unit: 10 }, "seller_fixed_per_unit"),
    ).toBe(10);
    expect(
      snapshotNumber({ seller_pct_overage: "5" }, "seller_pct_overage"),
    ).toBe(5);
  });

  it("returns 0 for missing / null / non-numeric", () => {
    expect(snapshotNumber(null, "driver_fixed_per_delivery")).toBe(0);
    expect(snapshotNumber({}, "seller_fixed_per_unit")).toBe(0);
    expect(
      snapshotNumber({ seller_pct_overage: "abc" }, "seller_pct_overage"),
    ).toBe(0);
  });
});

describe("computeSellerItemBonus (13_Commission_Rules formula)", () => {
  // Typical order_items row shape (subset the helper reads).
  function mkItem(args: {
    quantity: string;
    unitPrice: string;
    recommendedPrice: string;
    snapshot: Record<string, unknown>;
  }): Parameters<typeof computeSellerItemBonus>[0] {
    // The real row has many more columns; TS needs a wider type — cast via unknown.
    return {
      quantity: args.quantity,
      unitPrice: args.unitPrice,
      recommendedPrice: args.recommendedPrice,
      commissionRuleSnapshot: args.snapshot,
    } as unknown as Parameters<typeof computeSellerItemBonus>[0];
  }

  it("fixed part only (no price overage)", () => {
    const out = computeSellerItemBonus(
      mkItem({
        quantity: "3",
        unitPrice: "100",
        recommendedPrice: "100",
        snapshot: { seller_fixed_per_unit: 10, seller_pct_overage: 5 },
      }),
    );
    expect(out.fixedPart).toBe(30);
    expect(out.overagePart).toBe(0);
    expect(out.totalBonus).toBe(30);
  });

  it("fixed + overage on margin above recommended", () => {
    const out = computeSellerItemBonus(
      mkItem({
        quantity: "2",
        unitPrice: "120",
        recommendedPrice: "100",
        // 20 margin × 2 qty × 10% = 4
        snapshot: { seller_fixed_per_unit: 5, seller_pct_overage: 10 },
      }),
    );
    expect(out.fixedPart).toBe(10);
    expect(out.overagePart).toBe(4);
    expect(out.totalBonus).toBe(14);
  });

  it("zero overage when unit price is at recommended or below", () => {
    const belowOut = computeSellerItemBonus(
      mkItem({
        quantity: "1",
        unitPrice: "90",
        recommendedPrice: "100",
        snapshot: { seller_fixed_per_unit: 10, seller_pct_overage: 20 },
      }),
    );
    expect(belowOut.overagePart).toBe(0);
    expect(belowOut.totalBonus).toBe(10);
  });

  it("all-zero snapshot yields zero bonus", () => {
    const out = computeSellerItemBonus(
      mkItem({
        quantity: "5",
        unitPrice: "100",
        recommendedPrice: "100",
        snapshot: {},
      }),
    );
    expect(out.totalBonus).toBe(0);
  });

  it("handles numeric-as-string snapshot values", () => {
    const out = computeSellerItemBonus(
      mkItem({
        quantity: "1",
        unitPrice: "110",
        recommendedPrice: "100",
        snapshot: { seller_fixed_per_unit: "7", seller_pct_overage: "5" },
      }),
    );
    expect(out.fixedPart).toBe(7);
    expect(out.overagePart).toBe(0.5); // 10 × 1 × 0.05
    expect(out.totalBonus).toBe(7.5);
  });
});
