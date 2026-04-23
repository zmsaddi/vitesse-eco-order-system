import type { AnyReport } from "@/modules/reports/dto";

// Phase 5.3 — CSV shape per slug for client-side download.

export function csvForReport(data: AnyReport): {
  headers: string[];
  rows: Array<Array<unknown>>;
} {
  switch (data.slug) {
    case "pnl":
      return {
        headers: ["metric", "value"],
        rows: [
          ["revenue", data.revenue],
          ["cogs", data.cogs],
          ["expenses", data.expenses],
          ["earnedBonuses", data.earnedBonuses],
          ["giftCost", data.giftCost],
          ["rewards", data.rewards],
          ["netProfit", data.netProfit],
        ],
      };
    case "revenue-by-day":
      return {
        headers: ["date", "revenue"],
        rows: data.series.map((r) => [r.date, r.revenue]),
      };
    case "top-clients-by-debt":
      return {
        headers: ["clientId", "clientName", "totalRemaining"],
        rows: data.rows.map((r) => [r.clientId, r.clientName, r.totalRemaining]),
      };
    case "top-products-by-revenue":
      return {
        headers: ["productId", "productName", "revenue", "qty"],
        rows: data.rows.map((r) => [r.productId, r.productName, r.revenue, r.qty]),
      };
    case "expenses-by-category":
      return {
        headers: ["category", "total"],
        rows: data.rows.map((r) => [r.category, r.total]),
      };
    case "bonuses-by-user":
      return {
        headers: ["userId", "username", "role", "totalBonus"],
        rows: data.rows.map((r) => [r.userId, r.username, r.role, r.totalBonus]),
      };
  }
}
