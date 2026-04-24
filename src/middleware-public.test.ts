import { describe, expect, it } from "vitest";
import { isPublicMiddlewarePath, MIDDLEWARE_MATCHER } from "./middleware-public";

describe("middleware public paths", () => {
  it("allows auth entrypoints and probes", () => {
    expect(isPublicMiddlewarePath("/login")).toBe(true);
    expect(isPublicMiddlewarePath("/api/auth/session")).toBe(true);
    expect(isPublicMiddlewarePath("/api/health")).toBe(true);
    expect(isPublicMiddlewarePath("/api/init")).toBe(true);
  });

  it("allows installability assets without auth", () => {
    expect(isPublicMiddlewarePath("/manifest.webmanifest")).toBe(true);
    expect(isPublicMiddlewarePath("/sw.js")).toBe(true);
    expect(isPublicMiddlewarePath("/icons/icon-192.png")).toBe(true);
    expect(isPublicMiddlewarePath("/icons/icon-512-maskable.png")).toBe(true);
  });

  it("keeps app and API routes protected by default", () => {
    expect(isPublicMiddlewarePath("/")).toBe(false);
    expect(isPublicMiddlewarePath("/orders")).toBe(false);
    expect(isPublicMiddlewarePath("/api/v1/orders")).toBe(false);
    expect(isPublicMiddlewarePath("/api/v1/dashboard")).toBe(false);
  });

  it("locks matcher exclusions for manifest, icons and service worker", () => {
    expect(MIDDLEWARE_MATCHER).toContain("icons/");
    expect(MIDDLEWARE_MATCHER).toContain("manifest\\.webmanifest");
    expect(MIDDLEWARE_MATCHER).toContain("sw\\.js");
  });
});
