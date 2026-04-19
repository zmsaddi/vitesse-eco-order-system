import Link from "next/link";
import { NAV_BY_ROLE } from "./nav-items";
import type { Role } from "@/lib/session-claims";

type SidebarProps = {
  role: Role;
  currentPath?: string;
};

/**
 * Role-filtered Sidebar (RTL by default via html dir).
 * Phase 1 MVP: static list from NAV_BY_ROLE (data-driven via permissions table
 * comes in Phase 2 when we add a /api/v1/me endpoint).
 */
export function Sidebar({ role, currentPath }: SidebarProps) {
  const items = NAV_BY_ROLE[role];

  return (
    <nav
      aria-label="الشريط الجانبي"
      className="flex h-full w-64 shrink-0 flex-col border-l border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="border-b border-gray-200 px-4 py-5 dark:border-gray-800">
        <div className="text-lg font-bold">Vitesse Eco</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{roleLabel(role)}</div>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {items.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  "block rounded px-3 py-2 text-sm transition " +
                  (isActive
                    ? "bg-gray-900 font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800")
                }
              >
                {item.labelAr}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    pm: "مدير المشروع",
    gm: "مدير عام",
    manager: "مدير فرعي",
    seller: "بائع",
    driver: "سائق",
    stock_keeper: "أمين مخزن",
  };
  return labels[role];
}
