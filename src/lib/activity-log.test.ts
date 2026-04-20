import { describe, expect, it } from "vitest";
import { canonicalJSON } from "./activity-log";

// D-80: canonicalJSON must be deterministic regardless of JS object insertion order.
// The hash-chain integrity depends on this; all other tests (integration) verify
// the chain itself against a live DB.

describe("canonicalJSON (Phase 3.0 D-80)", () => {
  it("sorts object keys lexicographically", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("produces identical output for differently ordered inputs", () => {
    const a = canonicalJSON({ x: 1, y: 2, z: { m: 3, n: 4 } });
    const b = canonicalJSON({ z: { n: 4, m: 3 }, y: 2, x: 1 });
    expect(a).toBe(b);
  });

  it("handles null/undefined as null", () => {
    expect(canonicalJSON(null)).toBe("null");
    expect(canonicalJSON(undefined)).toBe("null");
  });

  it("handles nested arrays + objects", () => {
    const v = { list: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
    expect(canonicalJSON(v)).toBe('{"list":[{"a":1,"b":2},{"c":3,"d":4}]}');
  });

  it("emits no whitespace", () => {
    expect(canonicalJSON({ x: { y: 1 } })).not.toMatch(/\s/);
  });

  it("escapes strings via JSON.stringify", () => {
    expect(canonicalJSON({ s: 'a"b' })).toBe('{"s":"a\\"b"}');
  });

  it("primitives pass through", () => {
    expect(canonicalJSON(42)).toBe("42");
    expect(canonicalJSON("hi")).toBe('"hi"');
    expect(canonicalJSON(true)).toBe("true");
  });

  it("empty object + empty array", () => {
    expect(canonicalJSON({})).toBe("{}");
    expect(canonicalJSON([])).toBe("[]");
  });
});
