import { describe, expect, it } from "vitest";
import {
  nextTheme,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "./resolve-theme";

// Phase 5.5 — pure theme helpers.

describe("readStoredTheme", () => {
  it("returns 'system' when storage is null", () => {
    expect(readStoredTheme(null)).toBe("system");
  });

  it("returns 'system' for invalid stored value", () => {
    const storage = { getItem: () => "bogus" };
    expect(readStoredTheme(storage)).toBe("system");
  });

  it("returns the stored valid value", () => {
    const storage = {
      getItem: (k: string) => (k === THEME_STORAGE_KEY ? "dark" : null),
    };
    expect(readStoredTheme(storage)).toBe("dark");
  });

  it("swallows storage access errors", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(readStoredTheme(storage)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("explicit 'dark' → 'dark' regardless of media", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("explicit 'light' → 'light' regardless of media", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("'system' follows media query", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
});
