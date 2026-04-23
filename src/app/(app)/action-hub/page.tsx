import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { PageShell } from "@/components/ui/PageShell";
import type { ActionHubResponse } from "@/modules/action-hub/dto";
import { ActionHubClient } from "./ActionHubClient";

// Phase 6.2 — Action Hub landing (pm/gm/manager role-home per D-72).
// Canonical fetch to /api/v1/action-hub; wrong-role visitors redirect to
// their own role-home via enforcePageRole.

async function fetchActionHubCanonically(): Promise<ActionHubResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("action-hub page: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();
  const res = await fetch(`${protocol}://${host}/api/v1/action-hub`, {
    headers: { cookie: cookieStr },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET /api/v1/action-hub → ${res.status}`);
  }
  return (await res.json()) as ActionHubResponse;
}

export default async function ActionHubPage() {
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  if (!claims) redirect("/login");

  const data = await fetchActionHubCanonically();

  return (
    <PageShell title="مركز العمل" subtitle={`أهلاً ${claims.name}`}>
      <ActionHubClient data={data} />
    </PageShell>
  );
}
