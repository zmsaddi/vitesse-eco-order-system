import { describe, expect, it } from "vitest";
import { CreateProductInput, UpdateProductPatch } from "./dto";

describe("CreateProductInput", () => {
  it("accepts valid input with sellPrice >= buyPrice", () => {
    const out = CreateProductInput.safeParse({
      name: "دراجة X",
      buyPrice: 100,
      sellPrice: 150,
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.catalogVisible).toBe(true);
      expect(out.data.lowStockThreshold).toBe(3);
      expect(out.data.stock).toBe(0);
    }
  });

  it("accepts equal buy and sell prices (boundary of BR-03)", () => {
    const out = CreateProductInput.safeParse({
      name: "دراجة Y",
      buyPrice: 100,
      sellPrice: 100,
    });
    expect(out.success).toBe(true);
  });

  it("rejects BR-03 violation: sellPrice < buyPrice", () => {
    const out = CreateProductInput.safeParse({
      name: "دراجة Z",
      buyPrice: 150,
      sellPrice: 100,
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const zErr = out.error.issues.find((i) => i.path.includes("sellPrice"));
      expect(zErr).toBeDefined();
    }
  });

  it("rejects negative prices", () => {
    const out = CreateProductInput.safeParse({
      name: "x",
      buyPrice: -1,
      sellPrice: 10,
    });
    expect(out.success).toBe(false);
  });

  it("rejects empty name", () => {
    const out = CreateProductInput.safeParse({
      name: "",
      buyPrice: 1,
      sellPrice: 1,
    });
    expect(out.success).toBe(false);
  });

  it("coerces catalogVisible default to true", () => {
    const out = CreateProductInput.safeParse({
      name: "X",
      buyPrice: 0,
      sellPrice: 0,
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.catalogVisible).toBe(true);
  });
});

describe("UpdateProductPatch", () => {
  it("accepts partial patch (price only)", () => {
    const out = UpdateProductPatch.safeParse({ sellPrice: 200 });
    expect(out.success).toBe(true);
  });

  it("accepts active toggle alone", () => {
    const out = UpdateProductPatch.safeParse({ active: false });
    expect(out.success).toBe(true);
  });

  it("rejects empty patch", () => {
    const out = UpdateProductPatch.safeParse({});
    expect(out.success).toBe(false);
  });

  it("note: BR-03 cross-field check is enforced at service layer, not DTO", () => {
    // Patch of ONLY sellPrice can't fail BR-03 in DTO — service compares against current buyPrice.
    const out = UpdateProductPatch.safeParse({ sellPrice: 10 });
    expect(out.success).toBe(true);
  });
});
