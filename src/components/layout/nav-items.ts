import type { Role } from "@/lib/session-claims";

// Navigation items per role — D-72 (task-first for operational, action-hub for admin)
// + D-71 (MVP scope: no voice UI button, no command palette, no activity log UI, no permissions UI).
// Phase 5.1b adds /notifications to every role's nav. /settings/notifications
// is accessed via in-page link + bell dropdown, not a nav entry.

export type NavItem = {
  href: string;
  labelAr: string;
  icon?: string; // lucide-react icon name (Phase 2 wires real icons)
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  pm: [
    { href: "/action-hub", labelAr: "مركز العمل" },
    { href: "/orders", labelAr: "الطلبات" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/suppliers", labelAr: "الموردون" },
    { href: "/deliveries", labelAr: "التوصيلات" },
    { href: "/invoices", labelAr: "الفواتير" },
    { href: "/treasury", labelAr: "الصناديق" },
    { href: "/settlements", labelAr: "التسويات" },
    { href: "/notifications", labelAr: "الإشعارات" },
    { href: "/activity", labelAr: "سجل النشاطات" },
    { href: "/users", labelAr: "المستخدمون" },
    { href: "/settings", labelAr: "الإعدادات" },
  ],
  gm: [
    { href: "/action-hub", labelAr: "مركز العمل" },
    { href: "/orders", labelAr: "الطلبات" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/suppliers", labelAr: "الموردون" },
    { href: "/deliveries", labelAr: "التوصيلات" },
    { href: "/invoices", labelAr: "الفواتير" },
    { href: "/treasury", labelAr: "الصناديق" },
    { href: "/settlements", labelAr: "التسويات" },
    { href: "/notifications", labelAr: "الإشعارات" },
    { href: "/activity", labelAr: "سجل النشاطات" },
    { href: "/users", labelAr: "المستخدمون" },
  ],
  manager: [
    { href: "/action-hub", labelAr: "مركز العمل" },
    { href: "/orders", labelAr: "طلبات فريقي" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/deliveries", labelAr: "التوصيلات" },
    { href: "/treasury", labelAr: "صندوقي" },
    { href: "/notifications", labelAr: "الإشعارات" },
    { href: "/activity", labelAr: "سجل نشاط فريقي" },
    // Phase 4.4 contract (2026-04-21): /settlements is pm/gm only. Manager
    // has no settlement-creation rights; link removed to match the API gate.
  ],
  seller: [
    { href: "/orders", labelAr: "طلباتي" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "الكتالوج" },
    { href: "/my-bonus", labelAr: "عمولتي" },
    { href: "/notifications", labelAr: "الإشعارات" },
  ],
  driver: [
    { href: "/driver-tasks", labelAr: "مهامي" },
    { href: "/deliveries", labelAr: "توصيلاتي" },
    { href: "/my-bonus", labelAr: "عمولتي" },
    { href: "/notifications", labelAr: "الإشعارات" },
  ],
  stock_keeper: [
    { href: "/preparation", labelAr: "التحضير" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/inventory", labelAr: "الجرد" },
    { href: "/notifications", labelAr: "الإشعارات" },
  ],
};
