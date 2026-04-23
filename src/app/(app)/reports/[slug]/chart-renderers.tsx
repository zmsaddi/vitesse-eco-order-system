"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnyReport } from "@/modules/reports/dto";

// Phase 5.3 — chart renderer per report slug. Returns a recharts element
// that's wrapped by a <ResponsiveContainer> in the parent.

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#65a30d",
];

export function renderChart(data: AnyReport): React.ReactElement {
  switch (data.slug) {
    case "pnl": {
      const rows = [
        { name: "الإيراد", value: Number(data.revenue) },
        { name: "COGS", value: -Number(data.cogs) },
        { name: "المصاريف", value: -Number(data.expenses) },
        { name: "عمولات", value: -Number(data.earnedBonuses) },
        { name: "هدايا", value: -Number(data.giftCost) },
        { name: "مكافآت", value: -Number(data.rewards) },
        { name: "صافي الربح", value: Number(data.netProfit) },
      ];
      return (
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#2563eb" />
        </BarChart>
      );
    }
    case "revenue-by-day":
      return (
        <LineChart
          data={data.series.map((r) => ({ date: r.date, revenue: Number(r.revenue) }))}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="revenue" stroke="#16a34a" />
        </LineChart>
      );
    case "top-clients-by-debt":
      return (
        <BarChart
          layout="vertical"
          data={data.rows.map((r) => ({
            name: r.clientName,
            value: Number(r.totalRemaining),
          }))}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={120} />
          <Tooltip />
          <Bar dataKey="value" fill="#dc2626" />
        </BarChart>
      );
    case "top-products-by-revenue":
      return (
        <BarChart
          layout="vertical"
          data={data.rows.map((r) => ({
            name: r.productName,
            value: Number(r.revenue),
          }))}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={140} />
          <Tooltip />
          <Bar dataKey="value" fill="#2563eb" />
        </BarChart>
      );
    case "expenses-by-category":
      return (
        <PieChart>
          <Pie
            data={data.rows.map((r) => ({ name: r.category, value: Number(r.total) }))}
            dataKey="value"
            nameKey="name"
            outerRadius={110}
            label
          >
            {data.rows.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      );
    case "bonuses-by-user":
      return (
        <BarChart
          layout="vertical"
          data={data.rows.map((r) => ({
            name: `${r.username} (${r.role})`,
            value: Number(r.totalBonus),
          }))}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={160} />
          <Tooltip />
          <Bar dataKey="value" fill="#7c3aed" />
        </BarChart>
      );
  }
}
