import { describe, expect, it } from "vitest";
import { ClientDto, CreateClientInput, UpdateClientInput } from "./dto";

describe("clients DTO validators (D-69)", () => {
  describe("ClientDto", () => {
    it("accepts a well-formed client", () => {
      const input = {
        id: 1,
        name: "أحمد",
        latinName: "Ahmed",
        phone: "+33612345678",
        email: "ahmed@example.com",
        address: "Paris",
        descriptionAr: "",
        notes: "",
        createdBy: "admin",
        updatedBy: null,
        updatedAt: null,
        deletedAt: null,
        createdAt: "2026-04-19T10:00:00.000Z",
      };
      expect(ClientDto.safeParse(input).success).toBe(true);
    });

    it("rejects id ≤ 0", () => {
      const base = {
        name: "x",
        latinName: "",
        phone: "",
        email: "",
        address: "",
        descriptionAr: "",
        notes: "",
        createdBy: "a",
        updatedBy: null,
        updatedAt: null,
        deletedAt: null,
        createdAt: "2026-04-19T10:00:00.000Z",
      };
      expect(ClientDto.safeParse({ ...base, id: 0 }).success).toBe(false);
      expect(ClientDto.safeParse({ ...base, id: -1 }).success).toBe(false);
    });

    it("rejects empty name", () => {
      const base = {
        id: 1,
        latinName: "",
        phone: "",
        email: "",
        address: "",
        descriptionAr: "",
        notes: "",
        createdBy: "a",
        updatedBy: null,
        updatedAt: null,
        deletedAt: null,
        createdAt: "2026-04-19T10:00:00.000Z",
      };
      expect(ClientDto.safeParse({ ...base, name: "" }).success).toBe(false);
    });
  });

  describe("CreateClientInput", () => {
    it("accepts minimal input (just name)", () => {
      const parsed = CreateClientInput.safeParse({ name: "فاطمة" });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.latinName).toBe("");
        expect(parsed.data.phone).toBe("");
        expect(parsed.data.email).toBe("");
      }
    });

    it("accepts empty email (optional-by-empty-string pattern)", () => {
      expect(
        CreateClientInput.safeParse({ name: "x", email: "" }).success,
      ).toBe(true);
    });

    it("accepts valid email", () => {
      expect(
        CreateClientInput.safeParse({ name: "x", email: "a@b.co" }).success,
      ).toBe(true);
    });

    it("rejects invalid email (no @)", () => {
      const parsed = CreateClientInput.safeParse({ name: "x", email: "not-an-email" });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(
          parsed.error.flatten().fieldErrors.email?.[0]?.includes("البريد"),
        ).toBe(true);
      }
    });

    it("rejects invalid email (no dot)", () => {
      expect(
        CreateClientInput.safeParse({ name: "x", email: "a@bcom" }).success,
      ).toBe(false);
    });

    it("rejects empty name", () => {
      expect(CreateClientInput.safeParse({ name: "" }).success).toBe(false);
    });

    it("enforces max lengths", () => {
      expect(
        CreateClientInput.safeParse({
          name: "a".repeat(257),
        }).success,
      ).toBe(false);
      expect(
        CreateClientInput.safeParse({
          name: "a",
          phone: "1".repeat(65),
        }).success,
      ).toBe(false);
      expect(
        CreateClientInput.safeParse({
          name: "a",
          address: "x".repeat(1025),
        }).success,
      ).toBe(false);
    });
  });

  describe("UpdateClientInput", () => {
    it("matches CreateClientInput shape", () => {
      const payload = {
        name: "عميل",
        latinName: "",
        phone: "+33",
        email: "",
        address: "",
        descriptionAr: "",
        notes: "",
      };
      expect(UpdateClientInput.safeParse(payload).success).toBe(true);
    });
  });
});
