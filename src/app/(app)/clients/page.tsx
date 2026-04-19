import Link from "next/link";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { listActiveClients } from "@/modules/clients/service";
import { PageShell } from "@/components/ui/PageShell";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import type { ClientDto } from "@/modules/clients/dto";

// Clients list — pm/gm/manager/seller per D-12.
// Server-rendered + paginated. Phase 3 adds search/filter + TanStack Query.

const COLUMNS: Column<ClientDto>[] = [
  { key: "name", header: "الاسم", render: (c) => c.name },
  {
    key: "phone",
    header: "الهاتف",
    render: (c) => (c.phone ? <span dir="ltr">{c.phone}</span> : "—"),
  },
  {
    key: "email",
    header: "البريد",
    mobileHidden: true,
    render: (c) => (c.email ? <span dir="ltr">{c.email}</span> : "—"),
  },
  {
    key: "city",
    header: "العنوان",
    mobileHidden: true,
    render: (c) => c.address || "—",
  },
  {
    key: "actions",
    header: "",
    align: "end",
    render: (c) => (
      <Link
        href={`/clients/${c.id}/edit`}
        className="text-sm text-blue-700 hover:underline dark:text-blue-400"
      >
        تعديل
      </Link>
    ),
  },
];

type SearchParams = { page?: string };
const PAGE_SIZE = 50;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager", "seller"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, total } = await withRead(undefined, (db) =>
    listActiveClients(db, { limit: PAGE_SIZE, offset }),
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Only admin roles can edit existing clients (hide edit link for sellers — D-12).
  const canEdit = claims.role === "pm" || claims.role === "gm" || claims.role === "manager";
  const visibleColumns = canEdit ? COLUMNS : COLUMNS.filter((c) => c.key !== "actions");

  return (
    <PageShell
      title="العملاء"
      subtitle={`${total} عميل نشط — الصفحة ${page} من ${totalPages}`}
      actions={
        <Link href="/clients/new">
          <Button>+ عميل جديد</Button>
        </Link>
      }
    >
      <DataTable
        rows={rows}
        columns={visibleColumns}
        rowKey={(c) => c.id}
        cardTitle={(c) => c.name}
        empty={{
          title: "لا عملاء بعد",
          description: "أنشئ أول عميل عبر «+ عميل جديد».",
        }}
      />

      {totalPages > 1 && (
        <nav
          aria-label="التنقل بين الصفحات"
          className="mt-4 flex items-center justify-between gap-2 text-sm"
        >
          <Link
            href={`/clients?page=${Math.max(1, page - 1)}`}
            aria-disabled={page === 1}
            className={
              "rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700 " +
              (page === 1
                ? "pointer-events-none opacity-50"
                : "hover:bg-gray-50 dark:hover:bg-gray-800")
            }
          >
            السابق
          </Link>
          <span className="text-gray-500">
            {page} / {totalPages}
          </span>
          <Link
            href={`/clients?page=${Math.min(totalPages, page + 1)}`}
            aria-disabled={page === totalPages}
            className={
              "rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700 " +
              (page === totalPages
                ? "pointer-events-none opacity-50"
                : "hover:bg-gray-50 dark:hover:bg-gray-800")
            }
          >
            التالي
          </Link>
        </nav>
      )}
    </PageShell>
  );
}
