import { NextResponse } from "next/server";

// D-50: Typed error classes with userMessage (عربي) + developerMessage (EN, logs).
// D-78 §8: evidence — error codes are documented + testable.

export class BusinessRuleError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly code: string,
    public readonly status = 400,
    public readonly developerMessage?: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(userMessage);
    this.name = "BusinessRuleError";
  }
}

export class AuthError extends BusinessRuleError {
  constructor(msg = "غير مصرح — سجّل دخولك مجدداً") {
    super(msg, "UNAUTHORIZED", 401);
  }
}

export class PermissionError extends BusinessRuleError {
  constructor(msg = "ليس لديك صلاحية لتنفيذ هذا الإجراء") {
    super(msg, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends BusinessRuleError {
  constructor(entity: string) {
    super(`${entity} غير موجود`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends BusinessRuleError {
  constructor(msg = "البيانات المدخلة غير صحيحة. راجع الحقول المميَّزة", extra?: Record<string, unknown>) {
    super(msg, "VALIDATION_FAILED", 400, undefined, extra);
  }
}

export class ConflictError extends BusinessRuleError {
  constructor(userMsg: string, code: string, extra?: Record<string, unknown>) {
    super(userMsg, code, 409, undefined, extra);
  }
}

export class RateLimitError extends BusinessRuleError {
  constructor(msg = "وصلت الحد الأقصى للطلبات. انتظر قليلاً ثم حاول مجدداً") {
    super(msg, "RATE_LIMIT", 429);
  }
}

/**
 * Convert any error → NextResponse with safe body.
 * Arabic-prefix convention: only Arabic-starting messages bubble to UI; others are logged + replaced by fallback.
 */
export function apiError(err: unknown, fallback = "حدث خطأ ما. حاول مرة أخرى."): NextResponse {
  if (err instanceof BusinessRuleError) {
    return NextResponse.json(
      {
        error: err.userMessage,
        code: err.code,
        ...(err.extra ? { details: err.extra } : {}),
      },
      { status: err.status },
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  const isArabic = /^[\u0600-\u06FF]/.test(msg);
  if (!isArabic) {
    console.error("[api-error]", msg);
  }
  return NextResponse.json(
    { error: isArabic ? msg : fallback, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
