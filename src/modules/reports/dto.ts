import { z } from "zod";

// Phase 5.3 — Reports registry + per-slug response schemas.
//
// Exactly 6 slugs ship in this tranche — the other 5 of the original 11 in
// 24_Reports_List.md are deferred or out of MVP and their status is tracked
// in the updated 24_Reports_List.md.

export const REPORT_SLUGS = [
  "pnl",
  "revenue-by-day",
  "top-clients-by-debt",
  "top-products-by-revenue",
  "expenses-by-category",
  "bonuses-by-user",
] as const;
export type ReportSlug = (typeof REPORT_SLUGS)[number];

export const ReportSlugEnum = z.enum(REPORT_SLUGS);

export const ReportChartType = z.enum(["bar", "hbar", "line", "pie"]);
export type ReportChartType = z.infer<typeof ReportChartType>;

// Role permission per slug. pm/gm-only slugs reject manager with 403.
// Slugs that ship to manager use server-side team-scoping in the service.
export const REPORT_REGISTRY: Record<
  ReportSlug,
  {
    roles: ReadonlyArray<"pm" | "gm" | "manager">;
    titleAr: string;
    chart: ReportChartType;
    description: string;
  }
> = {
  pnl: {
    roles: ["pm", "gm"],
    titleAr: "الأرباح والخسائر (P&L)",
    chart: "bar",
    description: "Revenue − COGS − Expenses − Bonuses − GiftCost − Rewards",
  },
  "revenue-by-day": {
    roles: ["pm", "gm", "manager"],
    titleAr: "الإيرادات اليومية",
    chart: "line",
    description: "إجمالي إيرادات الدفعات لكل يوم ضمن الفترة",
  },
  "top-clients-by-debt": {
    roles: ["pm", "gm"],
    titleAr: "أعلى المدينين",
    chart: "hbar",
    description: "أكثر 20 عميل ديوناً (remaining > 0.01€)",
  },
  "top-products-by-revenue": {
    roles: ["pm", "gm"],
    titleAr: "أكثر المنتجات إيراداً",
    chart: "hbar",
    description: "أعلى 20 منتج من الطلبات المؤكَّدة ضمن الفترة",
  },
  "expenses-by-category": {
    roles: ["pm", "gm"],
    titleAr: "المصاريف حسب الفئة",
    chart: "pie",
    description: "مجموع المصاريف مجمَّعاً بالفئة ضمن الفترة",
  },
  "bonuses-by-user": {
    roles: ["pm", "gm", "manager"],
    titleAr: "العمولات حسب المستخدم",
    chart: "hbar",
    description: "مجموع العمولات لكل مستخدم ضمن الفترة",
  },
};

// Date range query shared across all slugs.
const IsoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD");

export const ReportQuery = z.object({
  dateFrom: IsoDateOnly.optional(),
  dateTo: IsoDateOnly.optional(),
});
export type ReportQuery = z.infer<typeof ReportQuery>;

// Response shapes — discriminated union on slug is overkill; each page knows
// which slug it fetched. Exports are plain type aliases.

export type PnlReport = {
  slug: "pnl";
  period: { from: string; to: string };
  revenue: string;
  cogs: string;
  expenses: string;
  earnedBonuses: string;
  giftCost: string;
  rewards: string;
  netProfit: string;
};

export type RevenueByDayReport = {
  slug: "revenue-by-day";
  period: { from: string; to: string };
  series: Array<{ date: string; revenue: string }>;
};

export type TopClientsByDebtReport = {
  slug: "top-clients-by-debt";
  period: { from: string; to: string };
  rows: Array<{ clientId: number; clientName: string; totalRemaining: string }>;
};

export type TopProductsByRevenueReport = {
  slug: "top-products-by-revenue";
  period: { from: string; to: string };
  rows: Array<{ productId: number; productName: string; revenue: string; qty: string }>;
};

export type ExpensesByCategoryReport = {
  slug: "expenses-by-category";
  period: { from: string; to: string };
  rows: Array<{ category: string; total: string }>;
};

export type BonusesByUserReport = {
  slug: "bonuses-by-user";
  period: { from: string; to: string };
  rows: Array<{ userId: number; username: string; role: string; totalBonus: string }>;
};

export type AnyReport =
  | PnlReport
  | RevenueByDayReport
  | TopClientsByDebtReport
  | TopProductsByRevenueReport
  | ExpensesByCategoryReport
  | BonusesByUserReport;
