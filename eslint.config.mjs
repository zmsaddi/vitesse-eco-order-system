import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// D-13 + Code Quality rule: كل ملف في src/ ≤ 300 سطر (blank lines + comments excluded).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Rule: max-lines on src/**/*.ts|tsx + underscore-prefix escape for unused vars
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "max-lines": [
        "error",
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      // Convention: prefix `_` on intentionally-unused args/vars (e.g. Phase 0 stubs
      // awaiting Phase 1 wiring). TypeScript ESLint respects the prefix.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated artifacts:
    "coverage/**",
    "src/db/migrations/**",
  ]),
]);

export default eslintConfig;
