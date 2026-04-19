import { requireRole } from "@/lib/session-claims";

// Driver task-first landing (D-72). Phase 4 replaces with real task cards + handover.
export default async function DriverTasksPage() {
  await requireRole(undefined, ["driver", "pm", "gm", "manager"]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">مهامي</h1>
      <p className="text-sm text-gray-500">
        بطاقات المهام (توصيل / جلب مورد / تحصيل) تُضاف في Phase 4، مع زر «تسليم الأموال» عند تراكم العهدة.
      </p>
    </div>
  );
}
