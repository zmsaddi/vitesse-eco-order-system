import { defineConfig } from "vitest/config";
import path from "node:path";

// D-75 + D-78: Coverage thresholds
//   General modules:  ≥ 70%
//   Critical business: ≥ 90% branch coverage
// Critical modules = src/modules/{orders,invoices,treasury,bonuses,distributions}/service.ts
// (يُفعَّل تدريجياً مع إضافة الـ modules في Phase 3..6)
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/app/**",            // UI + route handlers — covered by E2E / integration (Phase 1+)
        "src/middleware.ts",     // Edge middleware — tested via integration + manual
        "src/auth.ts",           // Auth.js wiring — covered by integration (login flow) in Phase 1+
        "src/auth.config.ts",    // Edge-safe config (declarative)
        "src/db/migrations/**",
        "src/db/schema/**",      // Drizzle declarations — verified via integration
        "src/db/client.ts",      // Live Neon — integration territory
        "src/db/seed.ts",        // Declarative seed data
        "src/components/**",     // UI components — covered by E2E + a11y (Phase 1+ once Playwright lands)
        "src/lib/env.ts",        // env var setup — smoke via build + integration
        "src/lib/activity-log.ts",  // D-80 hash-chain — covered by integration (needs DB)
        "src/lib/hash-chain.ts",    // Shared advisory-locked chain helper — integration only
        "src/lib/idempotency.ts",   // D-79 route wrapper — covered by integration (needs DB)
        "src/modules/**/permissions.ts", // Role visibility — exercised by integration routes
        "src/modules/**/ref-code.ts",    // BR-67 numbering — needs live DB for SPLIT_PART + lock
        "src/modules/**/chain.ts",       // Hash-chain verifiers — test helpers (integration)
        "src/modules/orders/pricing.ts",      // BR-03/21/22/35-39/41 — needs live DB (FOR UPDATE, settings, gift_pool)
        "src/modules/orders/preparation.ts",  // Preparation queue — integration-only query module
        "src/modules/orders/locks.ts",        // Phase 3.1.1 FOR UPDATE + cross-order VIN lookup (integration-only)
        "src/modules/deliveries/confirm.ts",      // Phase 4.0 — confirm-delivery full tx (DB-heavy)
        "src/modules/deliveries/bonuses.ts",      // Phase 4.0 — bonus computation + inserts (integration)
        "src/modules/deliveries/ref-code.ts",     // Phase 4.0 — BR-67 DL- counter (FOR UPDATE)
        "src/modules/deliveries/service.ts",      // Phase 4.0 — covered entirely by integration tests
        "src/modules/deliveries/assign.ts",       // Phase 4.0.1 — BR-23 self-assign (FOR UPDATE + driver_tasks write)
        "src/modules/orders/cancel-bonuses.ts",   // Phase 4.0.1 — BR-18 bonus-action mutator (FOR UPDATE on bonuses)
        "src/modules/invoices/d35-gate.ts",       // Phase 4.1 — reads settings table (integration)
        "src/modules/invoices/issue.ts",          // Phase 4.1 — invoice insert + hash chain + sequence (integration)
        "src/modules/invoices/pdf.ts",            // Phase 4.1 — pdfkit renderer, binary output (covered by integration PDF endpoint test)
        "src/modules/invoices/ref-code.ts",       // Phase 4.1 — atomic monthly sequence (integration)
        "src/modules/invoices/snapshots.ts",      // Phase 4.1.1 — reads settings+payments (integration)
        "src/modules/treasury/accounts.ts",       // Phase 4.2 — FOR UPDATE on treasury_accounts (integration)
        "src/modules/treasury/bridge.ts",         // Phase 4.2 — collection bridge + BR-55b cap (integration)
        "src/modules/treasury/handover.ts",       // Phase 4.2 — handover tx logic (integration)
        "src/modules/treasury/transfer.ts",       // Phase 4.3 — transfer tx + FOR UPDATE canonical order (integration)
        "src/modules/treasury/reconcile.ts",      // Phase 4.3 — reconcile tx + expected-from-movements SUM (integration)
        "src/modules/users/treasury-wiring.ts",   // Phase 4.2 — idempotent treasury-account provisioning (integration)
        "src/modules/settlements/payout.ts",      // Phase 4.4 — settlement tx + FOR UPDATE on bonuses+debts+source (integration)
        "src/modules/settlements/reward.ts",      // Phase 4.4 — reward tx (integration)
        "src/modules/settlements/list.ts",        // Phase 4.4 — list + summary aggregates (DB-heavy, integration)
        "src/modules/settlements/credit.ts",      // Phase 4.4 — unapplied-debt lock + sum helpers (integration)
        "src/modules/settlements/source-account.ts", // Phase 4.4 — source-type + paymentMethod invariants (integration-exercised via payout/reward)
        "src/modules/invoices/avoir/issue.ts",    // Phase 4.5 — avoir issuance tx + FOR UPDATE on parent + lines + children (integration)
        "src/modules/notifications/events.ts",    // Phase 5.1a — notification fan-out routing + preference filtering (DB-heavy, integration)
        "src/modules/notifications/service.ts",   // Phase 5.1a — lazy-seed + list/mark/prefs (integration)
        "src/modules/orders/emit-notifications.ts",    // Phase 5.1a — thin wrapper; tested via Phase-4 flow integration
        "src/modules/deliveries/emit-notifications.ts", // Phase 5.1a — thin wrapper; tested via confirm-delivery integration
        "src/lib/unread-count-header.ts",         // Phase 5.1a — in-memory cache + DB count (integration)
        "src/lib/notifications-client.ts",        // Phase 5.1b — browser fetch wrappers (no Node-side consumers; covered by manual UI test)
        "src/hooks/useUnreadCount.ts",            // Phase 5.1b — zustand store + window.fetch wrapper; no JSDOM in vitest setup
        "src/hooks/useNotifications.ts",          // Phase 5.1b — tanstack-query wrappers around notifications-client; no JSDOM
        "src/modules/activity/service.ts",        // Phase 5.2 — activity list query + manager-team filter (DB-heavy, integration)
        "src/modules/dashboard/service.ts",       // Phase 5.3 — dashboard dispatcher (DB-heavy, integration)
        "src/modules/dashboard/kpi-helpers.ts",   // Phase 5.3 — DB SUM aggregations (DB-heavy)
        "src/modules/dashboard/counts.ts",        // Phase 5.3 — DB COUNT queries (DB-heavy)
        "src/modules/dashboard/treasury-view.ts", // Phase 5.3 — treasury role-scoped select (DB-heavy)
        "src/modules/reports/service.ts",         // Phase 5.3 — reports dispatcher (DB-heavy)
        "src/modules/reports/runners-financial.ts",  // Phase 5.3 — P&L + expenses-by-category queries (DB-heavy)
        "src/modules/reports/runners-rankings.ts",   // Phase 5.3 — timeseries + rankings queries (DB-heavy)
        "src/modules/**/mappers.ts", // Trivial projections — covered via integration
        "src/modules/**/service.ts", // Business logic — covered by integration tests (require DB)
        "src/modules/users/nav.ts",  // Trivial re-export — covered via integration
        "src/types/**",
        "**/*.d.ts",
      ],
      // General modules ≥ 70%
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        // Critical business modules ≥ 90% branch
        // (سيُضاف لاحقاً في Phase 3+ عند وجود هذه الـ modules):
        // 'src/modules/orders/service.ts': { branches: 90, lines: 90 },
        // 'src/modules/invoices/service.ts': { branches: 90, lines: 90 },
        // 'src/modules/treasury/service.ts': { branches: 90, lines: 90 },
        // 'src/modules/bonuses/service.ts': { branches: 90, lines: 90 },
        // 'src/modules/distributions/service.ts': { branches: 90, lines: 90 },
      },
    },
  },
});
