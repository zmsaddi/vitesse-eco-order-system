import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { PageShell } from "@/components/ui/PageShell";
import {
  ListTreasuryQuery,
  type TreasurySnapshotDto,
} from "@/modules/treasury/dto";
import { TreasuryViewClient } from "./TreasuryViewClient";

// Phase 6.3 — Treasury snapshot page (read-only).
// Canonical fetch to /api/v1/treasury. Roles: pm, gm, manager, driver
// (matches backend); seller + stock_keeper redirected to role-home.

type SP = { movementsLimit?: string; movementsOffset?: string };

async function fetchTreasuryCanonically(query: {
  movementsLimit?: number;
  movementsOffset?: number;
}): Promise<TreasurySnapshotDto> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) throw new Error("treasury page: cannot resolve host");
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const sp = new URLSearchParams();
  if (query.movementsLimit !== undefined) {
    sp.set("movementsLimit", String(query.movementsLimit));
  }
  if (query.movementsOffset !== undefined) {
    sp.set("movementsOffset", String(query.movementsOffset));
  }
  const qs = sp.toString();

  const res = await fetch(
    `${protocol}://${host}/api/v1/treasury${qs ? `?${qs}` : ""}`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/treasury → ${res.status}`);
  }
  return (await res.json()) as TreasurySnapshotDto;
}

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager", "driver"]);
  if (!claims) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  if (sp.movementsLimit) raw.movementsLimit = sp.movementsLimit;
  if (sp.movementsOffset) raw.movementsOffset = sp.movementsOffset;
  const parsed = ListTreasuryQuery.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : { movementsLimit: 100, movementsOffset: 0 };

  const data = await fetchTreasuryCanonically(query);

  const titleForRole =
    claims.role === "manager"
      ? "صندوقي"
      : claims.role === "driver"
        ? "عهدتي"
        : "الصناديق";

  return (
    <PageShell
      title={titleForRole}
      subtitle={`${data.accounts.length} حساب · ${data.movementsTotal} حركة`}
    >
      <TreasuryViewClient
        accounts={data.accounts}
        movements={data.movements}
        movementsTotal={data.movementsTotal}
        query={query}
      />
    </PageShell>
  );
}
