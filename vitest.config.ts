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
        "src/app/**",            // UI — covered by E2E (Phase 1+)
        "src/db/migrations/**",
        "src/db/schema/**",      // Drizzle table declarations — no runtime logic to unit-test; verified via integration tests (Phase 1+)
        "src/db/client.ts",      // Requires live Neon branch — covered by integration tests
        "src/lib/env.ts",        // Requires env var setup — smoke-tested via build + integration
        "src/modules/**/dto.ts", // Zod schemas — verified implicitly when used in tests
        "src/modules/**/mappers.ts", // Trivial projections — covered via service-layer tests (Phase 1+)
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
