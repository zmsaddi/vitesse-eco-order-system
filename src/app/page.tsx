import { redirect } from "next/navigation";
import { getSessionClaims } from "@/lib/session-claims";

// Root — middleware already redirects authenticated users to role home (D-72).
// This page handles the case where middleware passes through (e.g. initial render).
export default async function RootPage() {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");

  const roleHome: Record<typeof claims.role, string> = {
    pm: "/action-hub",
    gm: "/action-hub",
    manager: "/action-hub",
    seller: "/orders",
    driver: "/driver-tasks",
    stock_keeper: "/preparation",
  };
  redirect(roleHome[claims.role]);
}
