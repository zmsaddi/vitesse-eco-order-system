import { describe, expect, it } from "vitest";
import { CreateSupplierInput, UpdateSupplierPatch } from "./dto";

describe("CreateSupplierInput", () => {
  it("accepts minimal valid input (name only)", () => {
    const out = CreateSupplierInput.safeParse({ name: "مورد A" });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.phone).toBe("");
      expect(out.data.address).toBe("");
      expect(out.data.notes).toBe("");
    }
  });

  it("rejects empty name", () => {
    const out = CreateSupplierInput.safeParse({ name: "" });
    expect(out.success).toBe(false);
  });

  it("rejects name > 256 chars", () => {
    const out = CreateSupplierInput.safeParse({ name: "x".repeat(257) });
    expect(out.success).toBe(false);
  });

  it("accepts all fields populated", () => {
    const out = CreateSupplierInput.safeParse({
      name: "مورد B",
      phone: "+33612345678",
      address: "باريس",
      notes: "مورد قديم",
    });
    expect(out.success).toBe(true);
  });
});

describe("UpdateSupplierPatch", () => {
  it("accepts partial patch (name only)", () => {
    const out = UpdateSupplierPatch.safeParse({ name: "جديد" });
    expect(out.success).toBe(true);
  });

  it("accepts active toggle alone", () => {
    const out = UpdateSupplierPatch.safeParse({ active: false });
    expect(out.success).toBe(true);
  });

  it("rejects empty patch (no fields)", () => {
    const out = UpdateSupplierPatch.safeParse({});
    expect(out.success).toBe(false);
  });

  it("rejects oversized name", () => {
    const out = UpdateSupplierPatch.safeParse({ name: "x".repeat(300) });
    expect(out.success).toBe(false);
  });
});
