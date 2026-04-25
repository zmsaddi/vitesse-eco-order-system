import Link from "next/link";
import type { NavItem } from "@/modules/users/nav";
import type { Role } from "@/lib/session-claims";

type SidebarProps = {
  items: NavItem[];
  role: Role; // for the header role label only
  currentPath?: string;
};

/**
 * Pure renderer — receives pre-filtered nav items as a prop.
 * Does NOT know which role sees what; that lives in `getNavForRole` (server-side).
 * Easy to swap for a DB-driven filter later without touching this component.
 */
export function Sidebar({ items, role, currentPath }: SidebarProps) {
  return (
    <nav
      aria-label="الشريط الجانبي"
      className="flex h-full w-64 shrink-0 flex-col border-l border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="border-b border-gray-200 px-4 py-5 dark:border-gray-800">
        <div className="text-lg font-bold tracking-tight">Vitesse Eco</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {roleLabel(role)}
        </div>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {items.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  "block rounded-md px-3 py-2 text-sm transition-colors " +
                  (isActive
                    ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-50"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60")
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
