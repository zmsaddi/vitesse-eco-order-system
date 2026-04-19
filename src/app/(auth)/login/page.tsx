import { signIn } from "@/auth";
import { redirect } from "next/navigation";

// Minimal login shell — Phase 1 MVP (D-71: narrow scope).
// Polish (toast feedback, password visibility, forgot-password) deferred to Phase 5.

type SearchParams = { next?: string; error?: string };

async function loginAction(formData: FormData): Promise<void> {
  "use server";
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  try {
    await signIn("credentials", {
      username,
      password,
      redirectTo: next,
    });
  } catch (err) {
    // Auth.js redirects on success; any throw-like here is either redirect (expected)
    // or a genuine credentials error. Let the framework re-throw redirects.
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
    redirect(`/login?error=invalid_credentials&next=${encodeURIComponent(next)}`);
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const nextPath = sp.next ?? "/";
  const errorKey = sp.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="mb-6 text-center text-2xl font-bold">تسجيل الدخول</h1>

        {errorKey && (
          <div
            role="alert"
            className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            اسم المستخدم أو كلمة المرور غير صحيحة. حاول مجدداً.
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={nextPath} />

          <label className="block">
            <span className="mb-1 block text-sm font-medium">اسم المستخدم</span>
            <input
              type="text"
              name="username"
              required
              autoFocus
              autoComplete="username"
              minLength={3}
              maxLength={64}
              dir="ltr"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">كلمة المرور</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              minLength={8}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            دخول
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">Vitesse Eco — Phase 1</p>
      </div>
    </main>
  );
}
