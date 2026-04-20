import { describe, expect, it } from "vitest";
import {
  CreateExpenseInput,
  ReverseExpenseInput,
  UpdateExpenseInput,
} from "./dto";

describe("CreateExpenseInput", () => {
  it("accepts valid input", () => {
    const out = CreateExpenseInput.safeParse({
      date: "2026-04-20",
      category: "postage",
      description: "طرد بريدي",
      amount: 15.5,
    });
    expect(out.success).toBe(true);
  });

  it("rejects zero/negative amount (reversal goes through /reverse)", () => {
    expect(CreateExpenseInput.safeParse({
      date: "2026-04-20",
      category: "x",
      description: "y",
      amount: 0,
    }).success).toBe(false);
    expect(CreateExpenseInput.safeParse({
      date: "2026-04-20",
      category: "x",
      description: "y",
      amount: -5,
    }).success).toBe(false);
  });

  it("rejects empty category / description", () => {
    expect(CreateExpenseInput.safeParse({
      date: "2026-04-20",
      category: "",
      description: "y",
      amount: 10,
    }).success).toBe(false);
    expect(CreateExpenseInput.safeParse({
      date: "2026-04-20",
      category: "x",
      description: "",
      amount: 10,
    }).success).toBe(false);
  });
});

describe("UpdateExpenseInput", () => {
  it("accepts partial patch", () => {
    expect(UpdateExpenseInput.safeParse({ notes: "new" }).success).toBe(true);
  });

  it("rejects empty patch", () => {
    expect(UpdateExpenseInput.safeParse({}).success).toBe(false);
  });
});

describe("ReverseExpenseInput", () => {
  it("accepts reason", () => {
    expect(ReverseExpenseInput.safeParse({ reason: "إدخال خاطئ" }).success).toBe(true);
  });
  it("rejects empty reason", () => {
    expect(ReverseExpenseInput.safeParse({ reason: "" }).success).toBe(false);
  });
});
