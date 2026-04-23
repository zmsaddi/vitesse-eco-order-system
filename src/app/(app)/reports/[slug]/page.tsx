import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { REPORT_REGISTRY, REPORT_SLUGS, type AnyReport, type ReportSlug } from "@/modules/reports/dto";
import { PageShell } from "@/components/ui/PageShell";
import { ReportClient } from "./ReportClient";

// Phase 5.3 — individual report page. Unknown slug → 404. Role without
// permission → redirect to /reports (index already filters to allowed).
// Registry drives the title + chart type; service returns the payload.

type SP = { dateFrom?: string; dateTo?: string };

async function fetchReport(
  slug: string,
  query: SP,
): Promise<AnyReport> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("report page: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const sp = new URLSearchParams();
  if (query.dateFrom) sp.set("dateFrom", query.dateFrom);
  if (query.dateTo) sp.set("dateTo", query.dateTo);
  const qs = sp.toString();

  const res = await fetch(
    `${protocol}://${host}/api/v1/reports/${encodeURIComponent(slug)}${
      qs ? `?${qs}` : ""
    }`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (res.status === 404) notFound();
  if (res.status === 403) redirect("/reports");
  if (!res.ok) throw new Error(`GET /api/v1/reports/${slug} → ${res.status}`);
  return (await res.json()) as AnyReport;
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  if (!claims) redirect("/login");

  const { slug } = await params;
  if (!(REPORT_SLUGS as readonly string[]).includes(slug)) notFound();
  const typedSlug = slug as ReportSlug;
  const allowed = REPORT_REGISTRY[typedSlug].roles;
  if (!(allowed as readonly string[]).includes(claims.role)) {
    redirect("/reports");
  }

  const sp = await searchParams;
  const initial = await fetchReport(typedSlug, sp);
  const meta = REPORT_REGISTRY[typedSlug];

  return (
    <PageShell
      title={meta.titleAr}
      subtitle={meta.description}
      actions={
        <Link
          href="/reports"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          كل التقارير
        </Link>
      }
    >
      <ReportClient slug={typedSlug} initialData={initial} />
    </PageShell>
  );
}
