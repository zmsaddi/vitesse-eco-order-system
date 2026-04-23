import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Phase 5.5 — shape-level sanity on public/manifest.webmanifest.
// If this test fails, the PWA install prompt won't work in Chrome's
// audit. Keeps the manifest file from silently drifting.

const manifestPath = resolve(process.cwd(), "public/manifest.webmanifest");
const raw = readFileSync(manifestPath, "utf8");
const m = JSON.parse(raw) as Record<string, unknown>;

describe("PWA manifest.webmanifest", () => {
  it("parses as valid JSON", () => {
    expect(typeof m).toBe("object");
  });

  it("declares the app identity", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
  });

  it("uses standalone display for a PWA install", () => {
    expect(m.display).toBe("standalone");
  });

  it("has a theme-color matching the dark navbar", () => {
    expect(m.theme_color).toBe("#111827");
  });

  it("declares both icons with required shapes", () => {
    const icons = m.icons as Array<{
      src: string;
      sizes: string;
      type: string;
      purpose?: string;
    }>;
    expect(Array.isArray(icons)).toBe(true);
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    const maskable = icons.find((i) => i.purpose?.includes("maskable"));
    expect(maskable).toBeDefined();
    expect(maskable?.sizes).toBe("512x512");
  });

  it("sets RTL + Arabic language for first paint", () => {
    expect(m.lang).toBe("ar");
    expect(m.dir).toBe("rtl");
  });
});
