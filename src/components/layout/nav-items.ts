import type { Role } from "@/lib/session-claims";

// Navigation items per role — D-72 (task-first for operational, action-hub for admin)
// + D-71 (MVP scope: no voice UI button, no command palette, no activity log UI, no permissions UI).
// Phase 5.1b adds /notifications to every role's nav. /settings/notifications
// is accessed via in-page link + bell dropdown, not a nav entry.
//
// Phase 6.3 (Nav 404 Remediation) — structural invariants now enforced by
// tests/integration/phase-6.3-nav-404-remediation.test.ts:
//   - every href must map to an on-disk page.tsx under src/app/(app)/**
//   - /inventory removed until src/modules/inventory/** is built (deferred Phase 6.6)
//   - /invoices expanded to every role the backend API allows (pm/gm/manager/seller/driver)
// Phase 6.4 (Deliveries List Endpoint + /deliveries page) — re-adds
// /deliveries to pm/gm/manager/driver now that GET /api/v1/deliveries exists.

export type NavItem = {
  href: string;
  labelAr: string;
  icon?: string; // lucide-react icon name (Phase 2 wires real icons)
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  pm: [
    { href: "/action-hub", labelAr: "مركز العمل" },
    { href: "/dashboard", labelAr: "لوحة التحكم" },
    { href: "/orders", labelAr: "الطلبات" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/suppliers", labelAr: "الموردون" },
    { href: "/deliveries", labelAr: "التوصيلات" },
    { href: "/invoices", labelAr: "الفواتير" },
    { href: "/treasury", labelAr: "الصناديق" },
    { href: "/settlements", labelAr: "التسويات" },
    { href: "/reports", labelAr: "التقارير" },
    { href: "/notifications", labelAr: "الإشعارات" },
    { href: "/activity", labelAr: "سجل النشاطات" },
    { href: "/users", labelAr: "المستخدمون" },
    { href: "/settings", labelAr: "الإعدادات" },
  ],
  gm: [
    { href: "/action-hub", labelAr: "مركز العمل" },
    { href: "/dashboard", labelAr: "لوحة التحكم" },
    { href: "/orders", labelAr: "الطلبات" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/suppliers", labelAr: "الموردون" },
    { href: "/deliveries", labelAr: "التوصيلات" },
    { href: "/invoices", labelAr: "الفواتير" },
    { href: "/treasury", labelAr: "الصناديق" },
    { href: "/settlements", labelAr: "التسويات" },
    { href: "/reports", labelAr: "التقارير" },
    { href: "/notifications", labelAr: "الإشعارات" },
    { href: "/activity", labelAr: "سجل النشاطات" },
    { href: "/users", labelAr: "المستخدمون" },
  ],
  manager: [
    { href: "/action-hub", labelAr: "مركز العمل" },
    { href: "/dashboard", labelAr: "لوحتي" },
    { href: "/orders", labelAr: "طلبات فريقي" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/deliveries", labelAr: "التوصيلات" },
    { href: "/invoices", labelAr: "فواتير فريقي" },
    { href: "/treasury", labelAr: "صندوقي" },
    { href: "/reports", labelAr: "تقارير فريقي" },
    { href: "/notifications", labelAr: "الإشعارات" },
    { href: "/activity", labelAr: "سجل نشاط فريقي" },
    // Phase 4.4 contract (2026-04-21): /settlements is pm/gm only. Manager
    // has no settlement-creation rights; link removed to match the API gate.
  ],
  seller: [
    { href: "/orders", labelAr: "طلباتي" },
    { href: "/clients", labelAr: "العملاء" },
    { href: "/products", labelAr: "الكتالوج" },
    { href: "/invoices", labelAr: "فواتيري" },
    { href: "/my-bonus", labelAr: "عمولتي" },
    { href: "/notifications", labelAr: "الإشعارات" },
  ],
  driver: [
    { href: "/driver-tasks", labelAr: "مهامي" },
    { href: "/deliveries", labelAr: "توصيلاتي" },
    { href: "/invoices", labelAr: "فواتير توصيلاتي" },
    { href: "/my-bonus", labelAr: "عمولتي" },
    { href: "/notifications", labelAr: "الإشعارات" },
  ],
  stock_keeper: [
    { href: "/preparation", labelAr: "التحضير" },
    { href: "/products", labelAr: "المنتجات" },
    { href: "/notifications", labelAr: "الإشعارات" },
  ],
};
