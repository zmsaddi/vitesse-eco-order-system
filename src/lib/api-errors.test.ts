import { describe, expect, it } from "vitest";
import {
  AuthError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
  apiError,
} from "./api-errors";

describe("api-errors typed classes (D-50)", () => {
  it("BusinessRuleError carries userMessage + code + status", () => {
    const e = new BusinessRuleError("رسالة بالعربية", "SOME_CODE", 409, "dev msg", { a: 1 });
    expect(e.userMessage).toBe("رسالة بالعربية");
    expect(e.code).toBe("SOME_CODE");
    expect(e.status).toBe(409);
    expect(e.developerMessage).toBe("dev msg");
    expect(e.extra).toEqual({ a: 1 });
  });

  it("AuthError defaults to 401 + Arabic message", () => {
    const e = new AuthError();
    expect(e.status).toBe(401);
    expect(e.code).toBe("UNAUTHORIZED");
    expect(/^[\u0600-\u06FF]/.test(e.userMessage)).toBe(true);
  });

  it("PermissionError defaults to 403", () => {
    expect(new PermissionError().status).toBe(403);
    expect(new PermissionError().code).toBe("FORBIDDEN");
  });

  it("NotFoundError includes entity in message", () => {
    const e = new NotFoundError("الطلب");
    expect(e.userMessage).toContain("الطلب");
    expect(e.status).toBe(404);
  });

  it("ValidationError defaults", () => {
    expect(new ValidationError().status).toBe(400);
    expect(new ValidationError().code).toBe("VALIDATION_FAILED");
  });

  it("ConflictError 409 with custom code", () => {
    const e = new ConflictError("تعارض", "MY_CONFLICT", { x: 1 });
    expect(e.status).toBe(409);
    expect(e.code).toBe("MY_CONFLICT");
    expect(e.extra).toEqual({ x: 1 });
  });

  it("RateLimitError 429", () => {
    expect(new RateLimitError().status).toBe(429);
  });
});

describe("apiError response builder", () => {
  it("converts BusinessRuleError to NextResponse with correct status+body", async () => {
    const res = apiError(new NotFoundError("المنتج"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("المنتج");
    expect(body.code).toBe("NOT_FOUND");
  });

  it("surfaces Arabic Error messages directly", async () => {
    const res = apiError(new Error("رسالة عربية مباشرة"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("رسالة عربية");
  });

  it("hides non-Arabic errors behind fallback", async () => {
    const res = apiError(new Error("cryptic internal sql error"), "حدث خطأ ما");
    const body = await res.json();
    expect(body.error).toBe("حدث خطأ ما");
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("forwards extra payload from BusinessRuleError", async () => {
    const err = new ConflictError("مكرر", "DUP", { id: 42 });
    const res = apiError(err);
    const body = await res.json();
    expect(body.details).toEqual({ id: 42 });
  });
});
