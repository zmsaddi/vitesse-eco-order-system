import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionClaims } from "@/lib/session-claims";
import { AppLayout } from "@/components/layout/AppLayout";

// Shared layout for all authenticated pages (inside (app) route group).
// middleware has already enforced auth — but we read claims here for AppLayout.

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");

  const hdrs = await headers();
  const currentPath = hdrs.get("x-pathname") ?? undefined;

  return (
    <AppLayout claims={claims} currentPath={currentPath}>
      {children}
    </AppLayout>
  );
}
