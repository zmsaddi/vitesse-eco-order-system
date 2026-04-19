import { requireRole } from "@/lib/session-claims";

// D-72 Action Hub — admin-only landing (pm/gm/manager).
// Phase 1: empty shell with copy. Real urgent-actions + recent-activity + team-status sections land in Phase 3+.

export default async function ActionHubPage() {
  const claims = await requireRole(undefined, ["pm", "gm", "manager"]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">مركز العمل</h1>
        <p className="mt-1 text-sm text-gray-500">
          أهلاً {claims.name}. المرحلة 1 — الـ shell فقط. إجراءات الأولوية + آخر نشاط الفريق تُضاف في Phase 3.
        </p>
      </header>

      <section aria-label="إجراءات مُلحَّة" className="rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 font-semibold">إجراءات مُلحَّة</h2>
        <p className="text-sm text-gray-500">لا إجراءات حالياً (Phase 3).</p>
      </section>

      <section aria-label="آخر نشاط" className="rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 font-semibold">آخر نشاط</h2>
        <p className="text-sm text-gray-500">سجل النشاط يُعرَض هنا ابتداءً من Phase 4.</p>
      </section>

      <section aria-label="حالة الفرق" className="rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 font-semibold">حالة الفرق</h2>
        <p className="text-sm text-gray-500">Counts (Phase 3): orders today · deliveries pending · low stock · open cancellations.</p>
      </section>
    </div>
  );
}
