import { describe, expect, it } from "vitest";
import { mapUniqueViolation } from "./service";
import { ConflictError } from "@/lib/api-errors";

// Unit tests for the PG 23505 mapper — mirrors the clients test pattern
// introduced in Phase 2b.1.1. Fabricates pg error shapes so no DB is needed.

describe("suppliers mapUniqueViolation (Phase 2c.1)", () => {
  it("maps 23505 on suppliers_name_phone_active_unique → DUPLICATE_SUPPLIER", () => {
    const fakeErr = {
      code: "23505",
      constraint: "suppliers_name_phone_active_unique",
      message: "duplicate key value violates unique constraint",
    };
    const out = mapUniqueViolation(fakeErr, { name: "مورد A", phone: "+33111111111" });
    expect(out).toBeInstanceOf(ConflictError);
    const conflict = out as ConflictError;
    expect(conflict.code).toBe("DUPLICATE_SUPPLIER");
    expect(conflict.extra).toMatchObject({
      axis: "phone",
      constraint: "suppliers_name_phone_active_unique",
      dupeInput: { name: "مورد A", phone: "+33111111111" },
    });
  });

  it("passes through non-23505 errors unchanged", () => {
    const originalErr = new Error("some unrelated PG error");
    const out = mapUniqueViolation(originalErr, { name: "x", phone: "y" });
    expect(out).toBe(originalErr);
  });

  it("passes through null/undefined unchanged", () => {
    expect(mapUniqueViolation(null, { name: "x", phone: "y" })).toBeNull();
    expect(mapUniqueViolation(undefined, { name: "x", phone: "y" })).toBeUndefined();
  });

  it("23505 without constraint field still maps (defensive — returns axis=phone)", () => {
    const fakeErr = { code: "23505" };
    const out = mapUniqueViolation(fakeErr, { name: "X", phone: "Y" });
    expect(out).toBeInstanceOf(ConflictError);
    const conflict = out as ConflictError;
    expect(conflict.code).toBe("DUPLICATE_SUPPLIER");
    expect(conflict.extra).toMatchObject({ axis: "phone", constraint: "" });
  });

  // Regression guard: fails if anyone reads `constraint_name` again (the
  // bug fixed in Phase 2b.1.1 for clients, now also guarded for suppliers).
  it("regression: reads `constraint`, NOT `constraint_name`", () => {
    const errWithOldKey = {
      code: "23505",
      constraint_name: "suppliers_name_phone_active_unique", // the WRONG key
    };
    const out = mapUniqueViolation(errWithOldKey, { name: "x", phone: "y" }) as ConflictError;
    // Because `constraint` is absent, our mapper falls back to the empty default.
    // If someone changes this to read constraint_name, the `constraint` in extra
    // below will no longer be "" → this test will fail and flag the regression.
    expect(out.extra).toMatchObject({ constraint: "" });
  });
});
