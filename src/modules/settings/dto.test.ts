import { describe, expect, it } from "vitest";
import {
  INVOICE_READINESS_KEYS,
  InvoiceReadinessDto,
  SettingKey,
  SettingsPatch,
} from "./dto";

describe("SettingKey enum", () => {
  it("accepts canonical keys", () => {
    expect(SettingKey.safeParse("shop_iban").success).toBe(true);
    expect(SettingKey.safeParse("sku_limit").success).toBe(true);
    expect(SettingKey.safeParse("vat_rate").success).toBe(true);
  });

  it("rejects unknown keys (D-28 CHECK parity)", () => {
    expect(SettingKey.safeParse("random_made_up_key").success).toBe(false);
    expect(SettingKey.safeParse("").success).toBe(false);
  });
});

describe("SettingsPatch", () => {
  it("accepts partial patch with canonical keys", () => {
    const out = SettingsPatch.safeParse({
      shop_name: "Vitesse Eco",
      shop_iban: "FR76...",
    });
    expect(out.success).toBe(true);
  });

  it("accepts empty patch (no-op)", () => {
    const out = SettingsPatch.safeParse({});
    expect(out.success).toBe(true);
  });

  it("rejects unknown keys", () => {
    const out = SettingsPatch.safeParse({
      unknown_key: "value",
    });
    expect(out.success).toBe(false);
  });

  it("rejects values > 4096 chars", () => {
    const out = SettingsPatch.safeParse({
      shop_name: "x".repeat(5000),
    });
    expect(out.success).toBe(false);
  });
});

describe("INVOICE_READINESS_KEYS (D-35)", () => {
  it("contains exactly the 4 mandatory mentions", () => {
    expect(INVOICE_READINESS_KEYS).toEqual([
      "shop_iban",
      "shop_bic",
      "shop_capital_social",
      "shop_rcs_number",
    ]);
  });

  it("every readiness key is a valid SettingKey", () => {
    for (const key of INVOICE_READINESS_KEYS) {
      expect(SettingKey.safeParse(key).success).toBe(true);
    }
  });
});

describe("InvoiceReadinessDto", () => {
  it("accepts { ready: true, missing: [] }", () => {
    const out = InvoiceReadinessDto.safeParse({ ready: true, missing: [] });
    expect(out.success).toBe(true);
  });

  it("accepts { ready: false, missing: [...] }", () => {
    const out = InvoiceReadinessDto.safeParse({
      ready: false,
      missing: ["shop_iban", "shop_bic"],
    });
    expect(out.success).toBe(true);
  });

  it("rejects missing entry with non-canonical key", () => {
    const out = InvoiceReadinessDto.safeParse({
      ready: false,
      missing: ["bogus_key"],
    });
    expect(out.success).toBe(false);
  });
});
