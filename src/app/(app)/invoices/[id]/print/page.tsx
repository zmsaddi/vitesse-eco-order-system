import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import type { InvoiceDetailDto } from "@/modules/invoices/dto";
import { PrintableInvoice } from "./PrintableInvoice";

// Phase 5.5 — browser-print HTML view of an invoice.
//
// Canonical fetch on /api/v1/invoices/[id] — the service layer enforces the
// own-only visibility (seller sees own-order invoices, driver sees
// assigned-delivery invoices, stock_keeper → 403). All legal mentions
// (D-35) come from the frozen JSONB on the invoice row, exactly like the
// PDF route. This page is a parallel render channel, not a replacement.
//
// Print chrome: the app layout's sidebar + topbar wrap this page on-screen
// but are hidden by the `@media print` stylesheet in `globals.css`.

type Params = { params: Promise<{ id: string }> };

async function fetchInvoice(id: string): Promise<InvoiceDetailDto> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("invoice print: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();
  const res = await fetch(
    `${protocol}://${host}/api/v1/invoices/${encodeURIComponent(id)}`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (res.status === 404) notFound();
  if (res.status === 403) redirect("/invoices");
  if (!res.ok) {
    throw new Error(`GET /api/v1/invoices/${id} → ${res.status}`);
  }
  return (await res.json()) as InvoiceDetailDto;
}

export default async function InvoicePrintPage({ params }: Params) {
  const claims = await enforcePageRole([
    "pm",
    "gm",
    "manager",
    "seller",
    "driver",
  ]);
  if (!claims) redirect("/login");

  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId) || invoiceId < 1) notFound();

  const detail = await fetchInvoice(id);

  return (
    <div className="print-root">
      <div className="no-print mb-4 flex items-center justify-between rounded border border-gray-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-gray-700 dark:bg-amber-950 dark:text-amber-100">
        <span>
          عرض مُهيَّأ للطباعة. استخدم <kbd>Ctrl+P</kbd> / <kbd>Cmd+P</kbd> لطباعة
          الفاتورة أو حفظها PDF من المتصفح. بديل: يمكنك استعمال PDF endpoint
          الأصلي إن كنت تفضِّل القالب المولَّد بـpdfkit.
        </span>
        <button
          type="button"
          data-print-trigger
          className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          طباعة
        </button>
      </div>

      <PrintableInvoice detail={detail} />

      {/* Tiny inline script to wire the print button without a whole
          client component. `dangerouslySetInnerHTML` is safe here — no
          user input, no template interpolation. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "document.querySelectorAll('[data-print-trigger]').forEach(function(b){b.addEventListener('click',function(){window.print();});});",
        }}
      />
    </div>
  );
}
