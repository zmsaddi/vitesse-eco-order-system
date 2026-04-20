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
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
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
