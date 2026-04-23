import Link from "next/link";
import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { reportsForRole } from "@/modules/reports/permissions";
import { PageShell } from "@/components/ui/PageShell";

// Phase 5.3 — reports index. Server component. Registry-driven list
// filtered by role so a manager never sees links to pm/gm-only reports.

export default async function ReportsIndexPage() {
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  if (!claims) redirect("/login");
  const items = reportsForRole(claims.role);

  return (
    <PageShell
      title="التقارير"
      subtitle={
        claims.role === "manager"
          ? "تقارير فريقي فقط"
          : "تقارير مالية وأدائية — تصدير CSV متاح داخل كل تقرير"
      }
    >
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => (
          <li
            key={r.slug}
            className="rounded border border-gray-200 bg-white p-4 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <Link href={`/reports/${r.slug}`} className="block">
              <h3 className="text-sm font-semibold">{r.titleAr}</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {r.description}
              </p>
              <p className="mt-2 text-[11px] text-gray-500">
                الرسم: {r.chart} · slug: {r.slug}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
