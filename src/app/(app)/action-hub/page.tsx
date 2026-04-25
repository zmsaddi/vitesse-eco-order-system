import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { PageShell } from "@/components/ui/PageShell";
import { loadActionHubPayload } from "@/modules/action-hub/service";
import { ActionHubClient } from "./ActionHubClient";

// Phase 6.2 → UX Hotfix Pack T3 — Action Hub landing.
// SSR path now reads via direct service call instead of a same-origin
// canonical fetch to /api/v1/action-hub. The API route stays unchanged for
// external consumers + the authz matrix; page-render drops one HTTP RTT and
// one Vercel function invocation per request.

export default async function ActionHubPage() {
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  if (!claims) redirect("/login");

  const data = await withRead(undefined, (db) =>
    loadActionHubPayload(db, {
      userId: claims.userId,
      username: claims.username,
      role: claims.role,
    }),
  );

  return (
    <PageShell title="مركز العمل" subtitle={`أهلاً ${claims.name}`}>
      <ActionHubClient data={data} />
    </PageShell>
  );
}
