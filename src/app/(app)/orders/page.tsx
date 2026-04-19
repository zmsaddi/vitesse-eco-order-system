import { requireRole } from "@/lib/session-claims";

// Seller/admin orders landing shell. Phase 3 replaces with real DataTable + multi-item form.
export default async function OrdersPage() {
  await requireRole(undefined, ["pm", "gm", "manager", "seller"]);
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الطلبات</h1>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded bg-gray-300 px-4 py-2 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          aria-disabled
        >
          + طلب جديد (Phase 3)
        </button>
      </header>
      <p className="text-sm text-gray-500">
        القائمة + النموذج يُضافان في Phase 3 (الطلبات متعددة الأصناف + cancellation C1).
      </p>
    </div>
  );
}
