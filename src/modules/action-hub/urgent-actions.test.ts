import { describe, expect, it } from "vitest";
import { isoDaysAgo, isIncompleteSettingValue } from "./urgent-actions";

// Phase 6.2 — unit tests for the pure helpers extracted out of
// urgent-actions.ts. DB-touching helpers (countOverduePayments, etc.) are
// tested end-to-end in tests/integration/phase-6.2-action-hub.test.ts
// against a live Neon branch per project convention (no Pool mocks).

describe("isoDaysAgo", () => {
  it("shifts back 7 days on a mid-month date", () => {
    expect(isoDaysAgo("2026-04-23", 7)).toBe("2026-04-16");
  });

  it("crosses month boundary", () => {
    expect(isoDaysAgo("2026-03-05", 7)).toBe("2026-02-26");
  });

  it("crosses year boundary", () => {
    expect(isoDaysAgo("2026-01-03", 7)).toBe("2025-12-27");
  });

  it("handles a 60-day shift (stale snapshot window)", () => {
    expect(isoDaysAgo("2026-04-23", 60)).toBe("2026-02-22");
  });

  it("zero-day shift is an identity", () => {
    expect(isoDaysAgo("2026-04-23", 0)).toBe("2026-04-23");
  });

  it("accepts large shifts without NaN", () => {
    const result = isoDaysAgo("2026-04-23", 365);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2025-04-23");
  });
});

describe("isIncompleteSettingValue", () => {
  it("flags undefined", () => {
    expect(isIncompleteSettingValue(undefined)).toBe(true);
  });

  it("flags null", () => {
    expect(isIncompleteSettingValue(null)).toBe(true);
  });

  it("flags empty string", () => {
    expect(isIncompleteSettingValue("")).toBe(true);
  });

  it("flags whitespace-only string", () => {
    expect(isIncompleteSettingValue("   ")).toBe(true);
  });

  it("flags TO_FILL placeholder (case-insensitive)", () => {
    expect(isIncompleteSettingValue("TO_FILL")).toBe(true);
    expect(isIncompleteSettingValue("to_fill")).toBe(true);
    expect(isIncompleteSettingValue("VALUE_TO_FILL_LATER")).toBe(true);
  });

  it("flags bare XXX placeholder", () => {
    expect(isIncompleteSettingValue("XXX")).toBe(true);
    expect(isIncompleteSettingValue("xxx")).toBe(true);
  });

  it("flags TODO placeholder", () => {
    expect(isIncompleteSettingValue("TODO")).toBe(true);
    expect(isIncompleteSettingValue("todo: fill later")).toBe(true);
  });

  it("accepts a real value", () => {
    expect(isIncompleteSettingValue("VITESSE ECO SAS")).toBe(false);
  });

  it("accepts a numeric string", () => {
    expect(isIncompleteSettingValue("10.5")).toBe(false);
  });

  it("accepts a SIRET", () => {
    expect(isIncompleteSettingValue("12345678901234")).toBe(false);
  });

  it("does NOT flag a legitimate value that happens to contain XXX as substring", () => {
    // e.g. a shop address containing 'Avenue des XXX' should still flag if it
    // is literally the 3-char token; a substring containing "XXX" elsewhere
    // is accepted. Current policy: only the exact-match XXX token is flagged.
    expect(isIncompleteSettingValue("Rue XXX avenue")).toBe(false);
  });
});
