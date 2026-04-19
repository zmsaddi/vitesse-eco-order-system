import { NextResponse, type NextRequest } from "next/server";
import { count } from "drizzle-orm";
import { withTxInRoute } from "@/db/client";
import { users } from "@/db/schema";
import { seedPermissions, seedSettings } from "@/db/seed";
import { hashPassword } from "@/lib/password";
import { env } from "@/lib/env";
import { apiError } from "@/lib/api-errors";

// D-24: first-run initializer.
// - POST /api/init (public, once) → seeds admin user + permissions + settings.
// - Generates a random 24-char admin password, logs it to stdout ONCE, returns it in response.
// - Refuses to run a SECOND time if any user already exists.
// - In production: still available but destructive reset paths are blocked (no action=reset).

export const runtime = "nodejs";

function generateRandomPassword(): string {
  // 24 chars from a safe alphabet
  const ALPHABET =
    "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function POST(_request: NextRequest) {
  try {
    const envResolved = env();

    return await withTxInRoute(undefined, async (tx) => {
      // Idempotency: refuse if any user exists.
      const [{ total }] = await tx
        .select({ total: count() })
        .from(users);
      if (Number(total) > 0) {
        return NextResponse.json(
          {
            error:
              "النظام مُهيَّأ مسبقاً. استخدم تسجيل الدخول بالحساب الموجود أو اتصل بمدير المشروع لإعادة تعيين كلمة مرور.",
            code: "ALREADY_INITIALIZED",
          },
          { status: 409 },
        );
      }

      // Generate random admin password.
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

      // Log password ONCE to stdout — operator is expected to capture it.
      console.warn(
        "\n=================================================\n" +
          "  ADMIN PASSWORD (save this — shown only once):\n" +
          `  ${adminPassword}\n` +
          "=================================================\n",
      );

      return NextResponse.json({
        ok: true,
        adminUsername: "admin",
        adminPassword, // returned ONCE; subsequent POSTs are rejected
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

// Block GET — init is write-only
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}

// Silence the unused-request lint where we don't need it.
export const dynamic = "force-dynamic";
