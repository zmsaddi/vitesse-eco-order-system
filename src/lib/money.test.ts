import { describe, expect, it } from "vitest";
import { moneyEquals, moneySum, round2, toDb, toNumber } from "./money";

describe("money.round2", () => {
  it("rounds half-cent up (FP-safe)", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.015)).toBe(1.02);
  });

  it("preserves exact 2-decimal values", () => {
    expect(round2(10.5)).toBe(10.5);
    expect(round2(10.99)).toBe(10.99);
  });

  it("rounds to 2 decimals from many-decimal input", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3); // classic FP trap
    expect(round2(1234.56789)).toBe(1234.57);
  });

  it("handles negatives (refunds)", () => {
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-100.25)).toBe(-100.25);
  });

  it("handles zero", () => {
    expect(round2(0)).toBe(0);
  });
});

describe("money.toNumber", () => {
  it("parses Drizzle NUMERIC string", () => {
    expect(toNumber("123.45")).toBe(123.45);
    expect(toNumber("0.00")).toBe(0);
  });

  it("passes through numbers", () => {
    expect(toNumber(99.99)).toBe(99.99);
  });

  it("treats null/undefined as 0", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  it("throws on NaN/Infinity", () => {
    expect(() => toNumber("not-a-number")).toThrow(/invalid numeric/);
    expect(() => toNumber(Infinity)).toThrow(/invalid numeric/);
  });
});

describe("money.toDb", () => {
  it("formats for NUMERIC(19,2) INSERT", () => {
    expect(toDb(123.456)).toBe("123.46");
    expect(toDb(0)).toBe("0.00");
    expect(toDb(-10.5)).toBe("-10.50");
  });

  it("throws on non-finite", () => {
    expect(() => toDb(NaN)).toThrow(/non-finite/);
  });
});

describe("money.moneyEquals", () => {
  it("treats values within 0.01€ as equal", () => {
    expect(moneyEquals(100.0, 100.004)).toBe(true);
    expect(moneyEquals(100.0, 100.01)).toBe(false);
  });
});

describe("money.moneySum", () => {
  it("sums with round2 protection", () => {
    expect(moneySum([0.1, 0.2, 0.3])).toBe(0.6);
    expect(moneySum([10.5, 20.25, 30.1])).toBe(60.85);
  });

  it("empty array → 0", () => {
    expect(moneySum([])).toBe(0);
  });
});
