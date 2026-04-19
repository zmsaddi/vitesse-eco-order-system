import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

// Minimal server-rendered DataTable for Phase 2 MVP.
// - Mobile (<768px): renders rows as cards via `cardLabel(row)` + `cardBody(row)` callbacks.
// - Desktop (≥768px): renders <table>.
// - No client-side sort/filter yet — those come in Phase 3 when TanStack Query lands in this tree.
// - CSV export not in Phase 2 MVP (deferred to post-MVP per D-71; would be an API route, not client).

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Hide from mobile card (desktop-only column). */
  mobileHidden?: boolean;
  /** CSS alignment for cell. */
  align?: "start" | "center" | "end";
};

type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  /** Unique key extractor for React. */
  rowKey: (row: T) => string | number;
  /** Mobile card title (shown on <768px only). */
  cardTitle?: (row: T) => ReactNode;
  empty?: {
    title: string;
    description?: string;
  };
};

export function DataTable<T>({ rows, columns, rowKey, cardTitle, empty }: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? "لا توجد بيانات لعرضها"}
        description={empty?.description}
      />
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <article
            key={rowKey(row)}
            className="rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-700"
          >
            {cardTitle && <header className="mb-2 font-semibold">{cardTitle(row)}</header>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {columns
                .filter((c) => !c.mobileHidden)
                .map((col) => (
                  <div key={col.key} className="contents">
                    <dt className="text-gray-500 dark:text-gray-400">{col.header}</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{col.render(row)}</dd>
                  </div>
                ))}
            </dl>
          </article>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block dark:border-gray-700">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={
                    "border-b border-gray-200 px-4 py-3 font-semibold dark:border-gray-700 " +
                    alignClass(col.align)
                  }
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                {columns.map((col) => (
                  <td key={col.key} className={"px-4 py-3 " + alignClass(col.align)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function alignClass(align?: "start" | "center" | "end"): string {
  switch (align) {
    case "center":
      return "text-center";
    case "end":
      return "text-end";
    default:
      return "text-start";
  }
}
