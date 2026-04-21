import { enforcePageRole } from "@/lib/session-claims";

// Phase 4.4 — pm/gm settlements console (minimal shell).
//
// The actual list + settlement/reward forms will land as client islands in a
// follow-up Phase 4.4 UI tranche. For now this page guards the route with
// server-side role enforcement and documents the two POST endpoints that
// pm/gm is expected to drive from here. Everything the UI needs is already
// exposed by /api/v1/settlements (GET + POST) and /api/v1/bonuses (GET),
// so adding UI does NOT reshape the API contract.
export default async function SettlementsPage() {
  const claims = await enforcePageRole(["pm", "gm"]);
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">التسويات والمكافآت</h1>
      </header>
      <section className="rounded border border-gray-200 p-4 text-sm dark:border-gray-800">
        <p className="text-gray-600 dark:text-gray-400">
          {`مرحباً ${claims.name} — واجهة التسويات متاحة عبر API حالياً:`}
        </p>
        <ul className="mt-2 list-disc pr-6 text-gray-700 dark:text-gray-300">
          <li>
            <code className="font-mono text-xs">GET /api/v1/settlements</code>{" "}
            — قائمة التسويات والمكافآت (مع pagination).
          </li>
          <li>
            <code className="font-mono text-xs">POST /api/v1/settlements</code>{" "}
            — إنشاء تسوية (<code>kind=settlement</code>) أو مكافأة (
            <code>kind=reward</code>). Idempotency-Key إلزامية.
          </li>
          <li>
            <code className="font-mono text-xs">GET /api/v1/bonuses</code>{" "}
            — كشف العلاوات الكامل (pm/gm) مع summary.
          </li>
        </ul>
      </section>
    </div>
  );
}
