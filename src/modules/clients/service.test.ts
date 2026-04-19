import { describe, expect, it } from "vitest";
import { mapUniqueViolation } from "./service";
import { BusinessRuleError } from "@/lib/api-errors";

// Direct unit tests for the race-safe 23505 mapping. Integration tests exercise
// the app-level pre-check path; the actual DB-constraint path can only be
// triggered by a genuine race, which is hard to reproduce in a test. So we test
// the mapper directly with fabricated PG error shapes.
//
// Phase 2b.1.1 guard: before this commit, the mapper read `constraint_name`
// while node-postgres actually exposes the property as `constraint`. The tests
// below lock in the correct property name + both axes + non-matching paths.

const INPUT = { name: "أحمد", phone: "+33612345678", email: "ahmed@example.com" };

describe("mapUniqueViolation (Phase 2b.1.1 — reads `constraint` property correctly)", () => {
  it("phone-index violation → ConflictError with axis=phone", () => {
    const pgErr = {
      code: "23505",
      constraint: "clients_name_phone_active_unique",
      message: "duplicate key value violates unique constraint \"clients_name_phone_active_unique\"",
    };
    const result = mapUniqueViolation(pgErr, INPUT);

    expect(result).toBeInstanceOf(BusinessRuleError);
    const err = result as BusinessRuleError;
    expect(err.code).toBe("DUPLICATE_CLIENT");
    expect(err.status).toBe(409);
    expect(err.userMessage).toContain("الهاتف");
    expect(err.extra).toMatchObject({
      axis: "phone",
      constraint: "clients_name_phone_active_unique",
      dupeInput: { name: "أحمد", phone: "+33612345678" },
    });
  });

  it("email-index violation → ConflictError with axis=email", () => {
    const pgErr = {
      code: "23505",
      constraint: "clients_name_email_active_unique",
      message: "duplicate key value violates unique constraint \"clients_name_email_active_unique\"",
    };
    const result = mapUniqueViolation(pgErr, INPUT);

    expect(result).toBeInstanceOf(BusinessRuleError);
    const err = result as BusinessRuleError;
    expect(err.code).toBe("DUPLICATE_CLIENT");
    expect(err.userMessage).toContain("البريد الإلكتروني");
    expect(err.extra).toMatchObject({
      axis: "email",
      constraint: "clients_name_email_active_unique",
      dupeInput: { name: "أحمد", email: "ahmed@example.com" },
    });
  });

  it("non-23505 error passes through unchanged (e.g. 23503 foreign_key_violation)", () => {
    const pgErr = { code: "23503", constraint: "fk_clients_something", message: "..." };
    const result = mapUniqueViolation(pgErr, INPUT);
    expect(result).toBe(pgErr); // SAME reference returned
  });

  it("null/undefined err passes through unchanged", () => {
    expect(mapUniqueViolation(null, INPUT)).toBeNull();
    expect(mapUniqueViolation(undefined, INPUT)).toBeUndefined();
  });

  it("plain Error (not a PG error) passes through unchanged", () => {
    const genericErr = new Error("boom");
    expect(mapUniqueViolation(genericErr, INPUT)).toBe(genericErr);
  });

  it("23505 with missing constraint property defaults to axis=phone (fail-safe)", () => {
    // If PG somehow doesn't surface the constraint name, we still return a
    // 409 DUPLICATE_CLIENT rather than leaking the raw error. Axis falls back
    // to phone (the more common case). UX impact: user sees a phone-flavored
    // message but at least gets a friendly 409 not a 500.
    const pgErr = { code: "23505", message: "unknown constraint" };
    const result = mapUniqueViolation(pgErr, INPUT);
    const err = result as BusinessRuleError;
    expect(err.code).toBe("DUPLICATE_CLIENT");
    expect(err.status).toBe(409);
    expect((err.extra as { axis: string }).axis).toBe("phone");
    expect((err.extra as { constraint: string }).constraint).toBe("");
  });

  it("23505 with constraint name containing 'email' (any position) picks email axis", () => {
    // Defensive: should match even if Neon/pg surfaces a slightly different name
    // (e.g. schema-qualified like "public.clients_email_idx").
    const pgErr = { code: "23505", constraint: "public.some_email_idx" };
    const result = mapUniqueViolation(pgErr, INPUT);
    const err = result as BusinessRuleError;
    expect((err.extra as { axis: string }).axis).toBe("email");
  });

  it("REGRESSION GUARD: reading `constraint_name` (old wrong key) would NOT work", () => {
    // If someone regresses the fix by reading `constraint_name`, this test
    // fails — because neon/pg never actually populates `constraint_name`.
    // We simulate the real Neon shape: `constraint` is set, `constraint_name` is absent.
    const pgErr = {
      code: "23505",
      constraint: "clients_name_email_active_unique",
      // constraint_name intentionally omitted — this is the real Neon shape
    };
    const result = mapUniqueViolation(pgErr, INPUT);
    const err = result as BusinessRuleError;
    // Must correctly identify as email axis, not default to phone.
    expect((err.extra as { axis: string }).axis).toBe("email");
  });
});
