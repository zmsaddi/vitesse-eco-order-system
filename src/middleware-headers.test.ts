import { describe, expect, it } from "vitest";
import { buildForwardHeaders, PATHNAME_HEADER } from "./middleware-headers";

// Regression guard for the Phase 2.1.1 fix.
// Phase 2.1 introduced an empty `new Headers()` that dropped cookies + all other
// incoming headers when forwarding the request to downstream Server Components.
// These tests lock in the contract: every original header survives, plus x-pathname is added.

describe("buildForwardHeaders — preserves ALL original request headers", () => {
  it("keeps a single cookie header (Auth.js session)", () => {
    const original = new Headers({
      cookie: "__Secure-next-auth.session-token=abc123; Path=/; Secure",
    });
    const forwarded = buildForwardHeaders(original, "/orders");

    expect(forwarded.get("cookie")).toBe(
      "__Secure-next-auth.session-token=abc123; Path=/; Secure",
    );
    expect(forwarded.get(PATHNAME_HEADER)).toBe("/orders");
  });

  it("keeps multiple unrelated headers (cookie + authorization + accept-language)", () => {
    const original = new Headers({
      cookie: "session=x",
      authorization: "Bearer token-xyz",
      "accept-language": "ar-SA,en;q=0.8",
      "user-agent": "Mozilla/5.0",
      "x-forwarded-for": "1.2.3.4",
    });
    const forwarded = buildForwardHeaders(original, "/users");

    expect(forwarded.get("cookie")).toBe("session=x");
    expect(forwarded.get("authorization")).toBe("Bearer token-xyz");
    expect(forwarded.get("accept-language")).toBe("ar-SA,en;q=0.8");
    expect(forwarded.get("user-agent")).toBe("Mozilla/5.0");
    expect(forwarded.get("x-forwarded-for")).toBe("1.2.3.4");
    expect(forwarded.get(PATHNAME_HEADER)).toBe("/users");
  });

  it("adds x-pathname when not present on the request", () => {
    const original = new Headers({ host: "vitesse-eco.fr" });
    const forwarded = buildForwardHeaders(original, "/action-hub");

    expect(forwarded.get("host")).toBe("vitesse-eco.fr");
    expect(forwarded.get(PATHNAME_HEADER)).toBe("/action-hub");
  });

  it("OVERWRITES x-pathname if a malicious/leftover header already set it", () => {
    // A request arriving with x-pathname already set (proxy forgery or test leakage)
    // must be replaced — NOT appended — so downstream RSCs always see the real path.
    const original = new Headers({
      cookie: "a=1",
      [PATHNAME_HEADER]: "/fake-admin",
    });
    const forwarded = buildForwardHeaders(original, "/orders");

    expect(forwarded.get("cookie")).toBe("a=1");
    expect(forwarded.get(PATHNAME_HEADER)).toBe("/orders"); // not "/fake-admin"
  });

  it("returns a NEW Headers instance (does not mutate original)", () => {
    const original = new Headers({ cookie: "session=one" });
    const forwarded = buildForwardHeaders(original, "/orders");

    // Mutating the forwarded copy must NOT affect original.
    forwarded.set("cookie", "tampered");
    expect(original.get("cookie")).toBe("session=one");
    expect(forwarded.get("cookie")).toBe("tampered");
  });

  it("handles empty original headers gracefully (still adds x-pathname)", () => {
    const original = new Headers();
    const forwarded = buildForwardHeaders(original, "/");

    expect(forwarded.get(PATHNAME_HEADER)).toBe("/");
    // No other headers should be present.
    const allKeys: string[] = [];
    forwarded.forEach((_, key) => allKeys.push(key));
    expect(allKeys).toEqual([PATHNAME_HEADER]);
  });

  it("preserves multi-value cookies (Headers API joins them; buildForwardHeaders forwards the joined value verbatim)", () => {
    // Node's Headers API uses `; ` to join multiple Cookie header values (per RFC 6265).
    // Whatever the runtime join character, buildForwardHeaders must forward the
    // combined string unchanged — i.e. no cookie value is lost.
    const original = new Headers();
    original.append("cookie", "a=1");
    original.append("cookie", "b=2");
    const joined = original.get("cookie"); // runtime-dependent separator

    const forwarded = buildForwardHeaders(original, "/orders");

    // Forward what was received; both cookie values must be present in the output.
    expect(forwarded.get("cookie")).toBe(joined);
    expect(forwarded.get("cookie")).toContain("a=1");
    expect(forwarded.get("cookie")).toContain("b=2");
  });
});
