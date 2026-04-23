import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withTxInRoute } from "@/db/client";
import { createUser } from "@/modules/users/service";
import { CreateUserInput } from "@/modules/users/dto";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

// PM/GM create-user page. Server action POSTs to the same service the API route uses.
// Keeps scope narrow: no client-side validation beyond native constraints +
// no optimistic UI. Phase 3 adds TanStack Query + toasts.

type SearchParams = { error?: string; field?: string };

async function createUserAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm"]);

  const raw = {
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? ""),
    profitSharePct: Number(formData.get("profitSharePct") ?? 0),
  };

  const parsed = CreateUserInput.safeParse(raw);
  if (!parsed.success) {
    const first = Object.keys(parsed.error.flatten().fieldErrors)[0] ?? "form";
    redirect(`/users/new?error=validation&field=${encodeURIComponent(first)}`);
  }

  try {
    await withTxInRoute(undefined, (tx) => createUser(tx, parsed.data, claims.username));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "DUPLICATE_USERNAME") {
      redirect("/users/new?error=duplicate&field=username");
    }
    redirect("/users/new?error=unknown");
  }
  redirect("/users");
}

const ROLE_OPTIONS: Array<{ value: string; labelAr: string }> = [
  { value: "pm", labelAr: "مدير المشروع" },
  { value: "gm", labelAr: "مدير عام" },
  { value: "manager", labelAr: "مدير فرعي" },
  { value: "seller", labelAr: "بائع" },
  { value: "driver", labelAr: "سائق" },
  { value: "stock_keeper", labelAr: "أمين مخزن" },
];

const ERROR_MESSAGES: Record<string, string> = {
  validation: "البيانات المدخلة غير صحيحة. راجع الحقول المميَّزة.",
  duplicate: "اسم المستخدم موجود مسبقاً. اختر اسماً آخر.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await enforcePageRole(["pm", "gm"]);
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <PageShell title="مستخدم جديد" subtitle="أنشئ حساباً لموظف في فريقك">
      {errorMsg && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      <form action={createUserAction}>
        <FormCard
          footer={
            <>
              <a
                href="/users"
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                إلغاء
              </a>
              <Button type="submit">إنشاء</Button>
            </>
          }
        >
          <Field
            label="اسم المستخدم"
            htmlFor="username"
            required
            hint="أحرف صغيرة وأرقام فقط، 3-64 حرف، يُستخدم لتسجيل الدخول"
          >
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={64}
              pattern="[a-z0-9_-]+"
              dir="ltr"
              autoComplete="off"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="الاسم الكامل" htmlFor="name" required>
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={1}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="الدور" htmlFor="role" required>
            <select
              id="role"
              name="role"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="">— اختر —</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.labelAr}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="كلمة المرور الأولية"
            htmlFor="password"
            required
            hint="8 أحرف على الأقل. سيُطلب من المستخدم تغييرها من إعدادات الحساب بعد أول دخول."
          >
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field
            label="نسبة المشاركة في الأرباح (%)"
            htmlFor="profitSharePct"
            hint="0-100. يُترك 0 للأدوار العملياتية (seller / driver / stock_keeper)."
          >
            <input
              id="profitSharePct"
              name="profitSharePct"
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={0}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>
        </FormCard>
      </form>
    </PageShell>
  );
}
