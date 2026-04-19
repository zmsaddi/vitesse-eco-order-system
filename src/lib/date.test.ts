import { describe, expect, it } from "vitest";
import { endOfDayUtc, now, startOfDayUtc, today, toDateString, TIMEZONE } from "./date";

describe("date utilities (Europe/Paris, BR-51)", () => {
  it("TIMEZONE constant is Europe/Paris", () => {
    expect(TIMEZONE).toBe("Europe/Paris");
  });

  it("now() returns a Date", () => {
    expect(now()).toBeInstanceOf(Date);
  });

  it("today() returns YYYY-MM-DD format", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("toDateString formats arbitrary Date to YYYY-MM-DD", () => {
    // 2026-04-19 in Paris
    const d = new Date("2026-04-19T12:00:00Z");
    expect(toDateString(d)).toBe("2026-04-19");
  });

  it("toDateString respects Europe/Paris (not UTC)", () => {
    // 2026-06-15 23:30 UTC = 2026-06-16 01:30 Paris (CEST) → date shift
    const lateEvening = new Date("2026-06-15T23:30:00Z");
    expect(toDateString(lateEvening)).toBe("2026-06-16");
  });

  it("startOfDayUtc returns UTC Date representing Paris midnight", () => {
    const utc = startOfDayUtc("2026-04-19");
    expect(utc).toBeInstanceOf(Date);
    // Paris midnight in April (CEST, UTC+2) = 22:00 UTC previous day
    expect(utc.getUTCHours()).toBe(22);
    expect(utc.getUTCDate()).toBe(18);
  });

  it("endOfDayUtc is next day's startOfDayUtc", () => {
    const endOf = endOfDayUtc("2026-04-19");
    const startOfNext = startOfDayUtc("2026-04-20");
    expect(endOf.getTime()).toBe(startOfNext.getTime());
  });

  it("handles winter (CET, UTC+1)", () => {
    const utc = startOfDayUtc("2026-01-15");
    // Paris midnight in January (CET, UTC+1) = 23:00 UTC previous day
    expect(utc.getUTCHours()).toBe(23);
    expect(utc.getUTCDate()).toBe(14);
  });
});
