import { requireRole } from "@/lib/session-claims";

// Stock keeper task-first landing. Phase 3 replaces with real pending-orders list.
export default async function PreparationPage() {
  await requireRole(undefined, ["stock_keeper", "pm", "gm", "manager"]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">التحضير</h1>
      <p className="text-sm text-gray-500">
        قائمة الطلبات المنتظرة التحضير تُضاف في Phase 3 (مع زر «بدء التحضير»).
      </p>
    </div>
  );
}
