// Phase 5.5 — minimal /offline page. Served by the PWA service worker as
// a fallback when navigation fails (no network + no fresh cache). Plain
// static server component — no auth, no DB, no external fetch — so it
// can be precached and shown offline.
//
// Kept intentionally small: a title, a short message, and a link back.
// Anything richer (local queue, retry button) is post-MVP polish.

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-white p-6 text-center dark:bg-gray-950">
        <main className="max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            لا اتصال بالإنترنت
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            تعذَّر الوصول إلى الخادم. تحقق من الاتصال وحاول مجدداً.
          </p>
          {/* Intentionally a plain <a>: this page is served by the service
              worker when navigation fails. A full browser reload back into
              the SPA is the intended behaviour; `next/link` would rely on
              the client runtime that isn't reachable here. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-block rounded border border-gray-300 px-4 py-2 text-sm text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            إعادة المحاولة
          </a>
        </main>
      </body>
    </html>
  );
}
