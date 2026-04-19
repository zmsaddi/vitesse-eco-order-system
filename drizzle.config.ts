import { defineConfig } from "drizzle-kit";

// Drizzle Kit config — migrations في src/db/migrations/
// Schema موزَّع domain-based في src/db/schema/*.ts (D-68 + code-quality ≤300 lines/file)
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
  casing: "snake_case",
});
