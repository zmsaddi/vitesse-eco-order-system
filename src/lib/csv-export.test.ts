import { describe, expect, it } from "vitest";
import { buildCsv, csvFilename } from "./csv-export";

// Phase 5.3 — unit tests for CSV builder.

describe("buildCsv", () => {
  it("prepends BOM + joins with ';' + ends with CRLF", () => {
    const out = buildCsv(["a", "b"], [[1, "x"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(out.includes("a;b\r\n")).toBe(true);
    expect(out.includes("1;x\r\n")).toBe(true);
  });

  it("quotes cells containing separator, quote, or newline", () => {
    const out = buildCsv(["h"], [["a;b"], ['a"b'], ["a\nb"]]);
    expect(out.includes('"a;b"')).toBe(true);
    expect(out.includes('"a""b"')).toBe(true);
    expect(out.includes('"a\nb"')).toBe(true);
  });

  it("renders null/undefined as empty string", () => {
    const out = buildCsv(["a", "b"], [[null, undefined]]);
    expect(out.includes(";")).toBe(true);
    // Header then an empty data row `;` then CRLF
    const lines = out.split("\r\n");
    expect(lines[1]).toBe(";");
  });

  it("handles empty rows array", () => {
    const out = buildCsv(["a"], []);
    const lines = out.split("\r\n");
    expect(lines[0].replace("﻿", "")).toBe("a");
  });
});

describe("csvFilename", () => {
  it("matches {entity}-YYYYMMDD-HHmm.csv pattern", () => {
    const fixed = new Date("2026-04-23T09:07:00+02:00");
    const name = csvFilename("report", fixed);
    expect(name).toMatch(/^report-\d{8}-\d{4}\.csv$/);
  });

  it("is stable for a given instant", () => {
    const fixed = new Date("2026-04-23T09:07:00+02:00");
    const a = csvFilename("x", fixed);
    const b = csvFilename("x", fixed);
    expect(a).toBe(b);
  });
});
