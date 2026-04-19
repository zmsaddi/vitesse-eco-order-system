import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password.hashPassword + verifyPassword", () => {
  it("rejects plaintext under 8 chars", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/too short/);
  });

  it("hash is self-contained (includes algorithm params)", async () => {
    const h = await hashPassword("CorrectHorseBattery!");
    // Argon2id hashes start with $argon2id$; bcrypt with $2a|$2b|$2y$
    expect(h).toMatch(/^\$(argon2|2[aby])/);
    expect(h.length).toBeGreaterThan(30);
  });

  it("verify returns true for correct password", async () => {
    const h = await hashPassword("MyS3cret@Pass");
    expect(await verifyPassword("MyS3cret@Pass", h)).toBe(true);
  });

  it("verify returns false for wrong password", async () => {
    const h = await hashPassword("MyS3cret@Pass");
    expect(await verifyPassword("MyS3cret@Pas", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });

  it("verify returns false for malformed stored hash", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });
}, 30_000); // native binding cold-start may take ~1s
