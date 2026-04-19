import { describe, expect, it } from "vitest";
import { breakdown, htFromTtc, tvaFromTtc, ttcFromHt } from "./tva";

describe("tva.tvaFromTtc", () => {
  it("extracts TVA from TTC at 20%", () => {
    // 120€ TTC at 20% → TVA = 20€, HT = 100€
    expect(tvaFromTtc(120, 20)).toBe(20);
    // 1200€ TTC → 200€ TVA
    expect(tvaFromTtc(1200, 20)).toBe(200);
  });

  it("handles 5.5% reduced rate", () => {
    expect(tvaFromTtc(105.5, 5.5)).toBe(5.5);
  });

  it("handles 0% rate (export)", () => {
    expect(tvaFromTtc(100, 0)).toBe(0);
  });

  it("rejects invalid rate", () => {
    expect(() => tvaFromTtc(100, -1)).toThrow(/invalid rate/);
    expect(() => tvaFromTtc(100, 101)).toThrow(/invalid rate/);
  });
});

describe("tva.htFromTtc", () => {
  it("extracts HT from TTC", () => {
    expect(htFromTtc(120, 20)).toBe(100);
    expect(htFromTtc(1200, 20)).toBe(1000);
  });
});

describe("tva.ttcFromHt", () => {
  it("computes TTC from HT", () => {
    expect(ttcFromHt(100, 20)).toBe(120);
    expect(ttcFromHt(50, 5.5)).toBe(52.75);
  });
});

describe("tva.breakdown", () => {
  it("returns complete breakdown for invoice render", () => {
    const b = breakdown(1200, 20);
    expect(b.totalTtc).toBe(1200);
    expect(b.totalHt).toBe(1000);
    expect(b.tvaAmount).toBe(200);
    expect(b.vatRate).toBe(20);
  });

  it("totalHt + tvaAmount reconciles to totalTtc (0.01€ tolerance)", () => {
    const b = breakdown(1234.56, 20);
    expect(Math.abs(b.totalHt + b.tvaAmount - b.totalTtc)).toBeLessThan(0.01);
  });
});
