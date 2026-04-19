import Link from "next/link";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { listSuppliers } from "@/modules/suppliers/service";
import { PageShell } from "@/components/ui/PageShell";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import type { SupplierDto } from "@/modules/suppliers/dto";

const COLUMNS: Column<SupplierDto>[] = [
  { key: "name", header: "الاسم", render: (s) => s.name },
  { key: "phone", header: "الهاتف", render: (s) => (s.phone ? <span dir="ltr">{s.phone}</span> : "—") },
  { key: "address", header: "العنوان", mobileHidden: true, render: (s) => s.address || "—" },
  {
    key: "credit",
    header: "رصيد دائن (€)",
    mobileHidden: true,
    align: "end",
    render: (s) => (s.creditDueFromSupplier !== 0 ? s.creditDueFromSupplier.toFixed(2) : "—"),
  },
  { key: "status", header: "الحالة", render: (s) => (s.active ? "نشط" : "معطَّل") },
  {
    key: "actions",
    header: "",
    align: "end",
    render: (s) => (
      <Link
        href={`/suppliers/${s.id}/edit`}
        className="text-sm text-blue-700 hover:underline dark:text-blue-400"
      >
        تعديل
      </Link>
    ),
  },
];

type SearchParams = { page?: string };
const PAGE_SIZE = 50;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager", "stock_keeper"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, total } = await withRead(undefined, (db) =>
    listSuppliers(db, { limit: PAGE_SIZE, offset }),
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canMutate = claims.role === "pm" || claims.role === "gm" || claims.role === "manager";
  const visibleColumns = canMutate ? COLUMNS : COLUMNS.filter((c) => c.key !== "actions");

  return (
    <PageShell
      title="الموردون"
      subtitle={`${total} مورد — الصفحة ${page} من ${totalPages}`}
      actions={
        canMutate ? (
          <Link href="/suppliers/new">
            <Button>+ مورد جديد</Button>
          </Link>
        ) : null
      }
    >
      <DataTable
        rows={rows}
        columns={visibleColumns}
        rowKey={(s) => s.id}
        cardTitle={(s) => s.name}
        empty={{
          title: "لا موردون بعد",
          description: canMutate ? "أنشئ أول مورد عبر «+ مورد جديد»." : undefined,
        }}
      />

      {totalPages > 1 && (
        <nav aria-label="التنقل بين الصفحات" className="mt-4 flex items-center justify-between gap-2 text-sm">
          <Link
            href={`/suppliers?page=${Math.max(1, page - 1)}`}
            aria-disabled={page === 1}
            className={
              "rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700 " +
              (page === 1 ? "pointer-events-none opacity-50" : "hover:bg-gray-50 dark:hover:bg-gray-800")
            }
          >
            السابق
          </Link>
          <span className="text-gray-500">{page} / {totalPages}</span>
          <Link
            href={`/suppliers?page=${Math.min(totalPages, page + 1)}`}
            aria-disabled={page === totalPages}
            className={
              "rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700 " +
              (page === totalPages ? "pointer-events-none opacity-50" : "hover:bg-gray-50 dark:hover:bg-gray-800")
            }
          >
            التالي
          </Link>
        </nav>
      )}
    </PageShell>
  );
}
