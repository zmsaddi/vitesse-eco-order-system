import { describe, expect, it } from "vitest";
import {
  currentMonthParisRange,
  parisDayAfter,
  parisDayStart,
  todayParisIso,
} from "./paris-date";

// Phase 5.3 — paris-date helpers. DST-aware.

describe("parisDayStart", () => {
  it("returns the UTC instant at 00:00 Europe/Paris — summer (CEST, +02:00)", () => {
    const d = parisDayStart("2026-07-15");
    expect(d.toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("returns the UTC instant at 00:00 Europe/Paris — winter (CET, +01:00)", () => {
    const d = parisDayStart("2026-01-15");
    expect(d.toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });
});

describe("parisDayAfter", () => {
  it("is +24h of parisDayStart on regular days", () => {
    const from = parisDayStart("2026-07-15");
    const to = parisDayAfter("2026-07-15");
    expect(to.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
  });

  it("handles month boundaries", () => {
    const d = parisDayAfter("2026-01-31");
    // Feb 1 00:00 Paris (CET, +01:00) → 2026-01-31T23:00:00Z
    expect(d.toISOString()).toBe("2026-01-31T23:00:00.000Z");
  });
});

describe("todayParisIso", () => {
  it("formats YYYY-MM-DD for a known instant", () => {
    const fixed = new Date("2026-04-23T09:07:00+02:00");
    expect(todayParisIso(fixed)).toBe("2026-04-23");
  });
});

describe("currentMonthParisRange", () => {
  it("returns from=day-1, to=today", () => {
    const fixed = new Date("2026-04-23T09:07:00+02:00");
    const r = currentMonthParisRange(fixed);
    expect(r.from).toBe("2026-04-01");
    expect(r.to).toBe("2026-04-23");
  });
});
