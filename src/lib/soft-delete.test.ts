import { describe, expect, it } from "vitest";
import { isDeleted, notDeleted } from "./soft-delete";

// soft-delete helpers return Drizzle SQL fragments — tested structurally.
describe("soft-delete", () => {
  it("notDeleted produces an SQL object", () => {
    const sqlFrag = notDeleted({ name: "deleted_at" });
    expect(sqlFrag).toBeDefined();
    expect(typeof sqlFrag).toBe("object");
  });

  it("isDeleted produces an SQL object", () => {
    const sqlFrag = isDeleted({ name: "deleted_at" });
    expect(sqlFrag).toBeDefined();
    expect(typeof sqlFrag).toBe("object");
  });
});
