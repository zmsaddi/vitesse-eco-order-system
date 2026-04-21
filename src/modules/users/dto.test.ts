import { describe, expect, it } from "vitest";
import { CreateUserInput, RoleDto, UserDto } from "./dto";

describe("users DTO validators (D-69)", () => {
  describe("RoleDto", () => {
    it("accepts all 6 canonical roles", () => {
      for (const role of ["pm", "gm", "manager", "seller", "driver", "stock_keeper"]) {
        expect(RoleDto.safeParse(role).success).toBe(true);
      }
    });

    it("rejects unknown roles", () => {
      expect(RoleDto.safeParse("admin").success).toBe(false);
      expect(RoleDto.safeParse("").success).toBe(false);
      expect(RoleDto.safeParse(null).success).toBe(false);
    });
  });

  describe("UserDto", () => {
    it("accepts a well-formed user", () => {
      const input = {
        id: 1,
        username: "admin",
        name: "مدير",
        role: "pm",
        active: true,
        profitSharePct: 10,
        profitShareStart: "2026-01-01",
        onboardedAt: "2026-04-19T12:00:00.000Z",
        managerId: null,
        createdAt: "2026-04-19T10:00:00.000Z",
      };
      expect(UserDto.safeParse(input).success).toBe(true);
    });

    it("rejects profitSharePct outside 0..100", () => {
      const base = {
        id: 1,
        username: "admin",
        name: "مدير",
        role: "pm" as const,
        active: true,
        profitShareStart: null,
        onboardedAt: null,
        managerId: null,
        createdAt: "2026-04-19T10:00:00.000Z",
      };
      expect(UserDto.safeParse({ ...base, profitSharePct: -1 }).success).toBe(false);
      expect(UserDto.safeParse({ ...base, profitSharePct: 101 }).success).toBe(false);
      expect(UserDto.safeParse({ ...base, profitSharePct: 50 }).success).toBe(true);
    });

    it("accepts null profitShareStart and onboardedAt", () => {
      const parsed = UserDto.safeParse({
        id: 1,
        username: "seller1",
        name: "بائع",
        role: "seller",
        active: true,
        profitSharePct: 0,
        profitShareStart: null,
        onboardedAt: null,
        managerId: null,
        createdAt: "2026-04-19T10:00:00.000Z",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts a driver with a concrete managerId", () => {
      const parsed = UserDto.safeParse({
        id: 1,
        username: "driver1",
        name: "سائق",
        role: "driver",
        active: true,
        profitSharePct: 0,
        profitShareStart: null,
        onboardedAt: null,
        managerId: 5,
        createdAt: "2026-04-19T10:00:00.000Z",
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("CreateUserInput", () => {
    it("enforces username charset (lowercase + digits + _ / -)", () => {
      expect(
        CreateUserInput.safeParse({
          username: "valid_name-1",
          password: "password123",
          name: "اسم",
          role: "seller",
        }).success,
      ).toBe(true);

      // Uppercase rejected
      expect(
        CreateUserInput.safeParse({
          username: "BadName",
          password: "password123",
          name: "اسم",
          role: "seller",
        }).success,
      ).toBe(false);

      // Spaces rejected
      expect(
        CreateUserInput.safeParse({
          username: "has space",
          password: "password123",
          name: "اسم",
          role: "seller",
        }).success,
      ).toBe(false);
    });

    it("enforces password minimum 8 chars", () => {
      const base = { username: "user1", name: "اسم", role: "seller" as const };
      expect(CreateUserInput.safeParse({ ...base, password: "short" }).success).toBe(false);
      expect(CreateUserInput.safeParse({ ...base, password: "longenough" }).success).toBe(true);
    });

    it("defaults profitSharePct to 0 and profitShareStart to null", () => {
      const parsed = CreateUserInput.parse({
        username: "seller1",
        password: "password123",
        name: "بائع",
        role: "seller",
      });
      expect(parsed.profitSharePct).toBe(0);
      expect(parsed.profitShareStart).toBeNull();
    });
  });
});
