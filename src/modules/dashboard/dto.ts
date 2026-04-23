import { z } from "zod";

// Phase 5.3 — Dashboard DTOs.

const IsoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD");

export const DashboardQuery = z.object({
  dateFrom: IsoDateOnly.optional(),
  dateTo: IsoDateOnly.optional(),
});
export type DashboardQuery = z.infer<typeof DashboardQuery>;

export const TreasuryBalanceDto = z.object({
  accountId: z.number().int().positive(),
  name: z.string(),
  type: z.string(),
  balance: z.string(),
});
export type TreasuryBalanceDto = z.infer<typeof TreasuryBalanceDto>;

export const DashboardResponse = z.object({
  period: z.object({
    from: IsoDateOnly,
    to: IsoDateOnly,
  }),
  kpis: z.object({
    revenue: z.string(),
    netProfit: z.string().nullable(),
    outstandingDebts: z.string(),
    cashProfit: z.string().nullable(),
  }),
  treasuryBalances: z.array(TreasuryBalanceDto),
  counts: z.object({
    ordersToday: z.number().int().nonnegative(),
    deliveriesPending: z.number().int().nonnegative(),
    lowStockCount: z.number().int().nonnegative(),
    openCancellations: z.number().int().nonnegative(),
  }),
});
export type DashboardResponse = z.infer<typeof DashboardResponse>;
