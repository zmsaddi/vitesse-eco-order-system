import { NextResponse, type NextRequest } from "next/server";
import { count } from "drizzle-orm";
import { withTxInRoute } from "@/db/client";
import { users } from "@/db/schema";
import { seedPermissions, seedSettings } from "@/db/seed";
import { hashPassword } from "@/lib/password";
import { env } from "@/lib/env";
import { apiError } from "@/lib/api-errors";

// D-24: first-run initializer — HARDENED in Phase 1a.
//
// Authorization (Phase 1a):
//   - In production: MUST supply `x-init-secret` header matching env INIT_BOOTSTRAP_SECRET.
//     If INIT_BOOTSTRAP_SECRET is unset in production → endpoint is disabled (503).
//   - In development: secret match required IF set; otherwise open (matches dev UX).
//
// Idempotency: refuses (409) if any user already exists.
//
// Response (on success): admin credentials shown ONCE. Operator must capture them immediately
// from either the stdout log or the HTTP response body; no second chance.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Constant-time string comparison — avoids timing leaks on header check.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function generateRandomPassword(): string {
  // 24 chars from an I/l/O/0-free alphabet (operator readability).
  const ALPHABET =
    "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const envResolved = env();

    // ─────────────────────────────────────────────
    // Phase 1a hardening: bootstrap secret gate
    // ─────────────────────────────────────────────
    const configuredSecret = envResolved.INIT_BOOTSTRAP_SECRET;
    const providedSecret = request.headers.get("x-init-secret") ?? "";

    if (envResolved.NODE_ENV === "production" && !configuredSecret) {
      // Production without secret configured: hard refusal.
      return NextResponse.json(
        {
          error: "نقطة التهيئة غير مفعَّلة في الإنتاج (INIT_BOOTSTRAP_SECRET غير مضبوط).",
          code: "INIT_DISABLED",
        },
        { status: 503 },
      );
    }

    if (configuredSecret) {
      if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
        return NextResponse.json(
          {
            error: "غير مصرح — header `x-init-secret` مفقود أو غير صحيح.",
            code: "INIT_UNAUTHORIZED",
          },
          { status: 401 },
        );
      }
    }

    return await withTxInRoute(undefined, async (tx) => {
      // Idempotency: refuse if any user exists.
      const [{ total }] = await tx.select({ total: count() }).from(users);
      if (Number(total) > 0) {
        return NextResponse.json(
          {
            error:
              "النظام مُهيَّأ مسبقاً. سجّل الدخول بالحساب الموجود أو اتصل بمدير المشروع لإعادة تعيين كلمة مرور.",
            code: "ALREADY_INITIALIZED",
          },
          { status: 409 },
        );
      }

      const adminPassword = generateRandomPassword();
      const adminHash = await hashPassword(adminPassword);

      await tx.insert(users).values({
        username: "admin",
        password: adminHash,
        name: "مدير المشروع",
        role: "pm",
        active: true,
        profitSharePct: "0",
      });

      const permCount = await seedPermissions(tx);
      const settingsCount = await seedSettings(tx);

      // Log password ONCE to stdout — operator capture.
      console.warn(
        "\n=================================================\n" +
          "  ADMIN PASSWORD (save this — shown only once):\n" +
          `  ${adminPassword}\n` +
          "=================================================\n",
      );

      return NextResponse.json({
        ok: true,
        adminUsername: "admin",
        adminPassword, // returned ONCE; subsequent POSTs are rejected by idempotency guard
        seeded: {
          users: 1,
          permissions: permCount,
          settings: settingsCount,
        },
        environment: envResolved.NODE_ENV,
        message:
          "تم إنشاء مستخدم admin. احفظ كلمة المرور فوراً — لن تُعرض مجدداً. سجّل الدخول ثم غيِّرها من الإعدادات.",
      });
    });
  } catch (err) {
    return apiError(err, "فشل في تهيئة النظام");
  }
}

// Block GET — init is write-only.
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
