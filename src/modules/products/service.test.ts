import { describe, expect, it } from "vitest";
import { mapUniqueViolation } from "./service";
import { ConflictError } from "@/lib/api-errors";

// Unit tests for the PG 23505 mapper — fills the race-safety gap flagged in
// Phase 2c.1 (reviewer: race on product name would have returned 500 instead of
// a friendly 409 DUPLICATE_PRODUCT_NAME).

describe("products mapUniqueViolation (Phase 2c.1)", () => {
  it("maps 23505 on products_name_unique → DUPLICATE_PRODUCT_NAME", () => {
    const fakeErr = {
      code: "23505",
      constraint: "products_name_unique",
      message: "duplicate key value violates unique constraint",
    };
    const out = mapUniqueViolation(fakeErr, "دراجة-A");
    expect(out).toBeInstanceOf(ConflictError);
    const conflict = out as ConflictError;
    expect(conflict.code).toBe("DUPLICATE_PRODUCT_NAME");
    expect(conflict.extra).toMatchObject({
      constraint: "products_name_unique",
      dupeName: "دراجة-A",
    });
  });

  it("passes through non-23505 errors unchanged", () => {
    const originalErr = new Error("something else");
    const out = mapUniqueViolation(originalErr, "x");
    expect(out).toBe(originalErr);
  });

  it("passes through 23505 on an UNRELATED constraint (not name)", () => {
    const fakeErr = {
      code: "23505",
      constraint: "some_other_unique_index",
    };
    const out = mapUniqueViolation(fakeErr, "x");
    // Not the name constraint → should propagate to let upper layer decide.
    expect(out).toBe(fakeErr);
  });

  it("passes through null/undefined unchanged", () => {
    expect(mapUniqueViolation(null, "x")).toBeNull();
    expect(mapUniqueViolation(undefined, "x")).toBeUndefined();
  });

  // Regression guard: any future rename to constraint_name would make the
  // constraint field empty here → the match-by-"name" test below fails.
  it("regression: reads `constraint`, NOT `constraint_name`", () => {
    const errWithOldKey = {
      code: "23505",
      constraint_name: "products_name_unique",
    };
    const out = mapUniqueViolation(errWithOldKey, "x");
    // Empty constraint → does not match "name" → passthrough.
    expect(out).toBe(errWithOldKey);
  });
});
