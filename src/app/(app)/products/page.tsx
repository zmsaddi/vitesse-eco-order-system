import Link from "next/link";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { listProducts } from "@/modules/products/service";
import { PageShell } from "@/components/ui/PageShell";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import type { ProductDto } from "@/modules/products/dto";

const COLUMNS: Column<ProductDto>[] = [
  { key: "name", header: "الاسم", render: (p) => p.name },
  { key: "category", header: "التصنيف", mobileHidden: true, render: (p) => p.category || "—" },
  {
    key: "sellPrice",
    header: "سعر البيع (€)",
    align: "end",
    render: (p) => p.sellPrice.toFixed(2),
  },
  {
    key: "stock",
    header: "المخزون",
    align: "end",
    render: (p) => {
      const low = p.stock <= p.lowStockThreshold;
      return (
        <span className={low ? "text-amber-700 dark:text-amber-400" : ""}>
          {p.stock.toFixed(2)} {p.unit}
        </span>
      );
    },
  },
  { key: "status", header: "الحالة", render: (p) => (p.active ? "نشط" : "معطَّل") },
  {
    key: "actions",
    header: "",
    align: "end",
    render: (p) => (
      <Link
        href={`/products/${p.id}/edit`}
        className="text-sm text-blue-700 hover:underline dark:text-blue-400"
      >
        تعديل
      </Link>
    ),
  },
];

type SearchParams = { page?: string };
const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const claims = await enforcePageRole([
    "pm",
    "gm",
    "manager",
    "stock_keeper",
    "seller",
    "driver",
  ]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, total } = await withRead(undefined, (db) =>
    listProducts(db, { limit: PAGE_SIZE, offset }),
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canMutate =
    claims.role === "pm" ||
    claims.role === "gm" ||
    claims.role === "manager" ||
    claims.role === "stock_keeper";
  const visibleColumns = canMutate ? COLUMNS : COLUMNS.filter((c) => c.key !== "actions");

  return (
    <PageShell
      title="المنتجات"
      subtitle={`${total} منتج — الصفحة ${page} من ${totalPages}`}
      actions={
        canMutate ? (
          <Link href="/products/new">
            <Button>+ منتج جديد</Button>
          </Link>
        ) : null
      }
    >
      <DataTable
        rows={rows}
        columns={visibleColumns}
        rowKey={(p) => p.id}
        cardTitle={(p) => p.name}
        empty={{
          title: "لا منتجات بعد",
          description: canMutate ? "أنشئ أول منتج عبر «+ منتج جديد»." : undefined,
        }}
      />

      {totalPages > 1 && (
        <nav aria-label="التنقل بين الصفحات" className="mt-4 flex items-center justify-between gap-2 text-sm">
          <Link
            href={`/products?page=${Math.max(1, page - 1)}`}
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
            href={`/products?page=${Math.min(totalPages, page + 1)}`}
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
