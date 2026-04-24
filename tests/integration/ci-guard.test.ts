import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HAS_DB } from "./setup";

// P-audit-4 — CI integration hard-fail guard.
//
// This file intentionally does NOT use describe.skipIf. Skipping it would
// defeat its whole purpose: guarding against silent-green CI runs when
// TEST_DATABASE_URL is absent. Every other integration file may skip with
// skipIf(!HAS_DB); this one must always execute.
//
// Local dev (CI env unset) → pass-through. CI without secret → hard fail.

describe("P-audit-4 — CI integration guard", () => {
  it("T-PA4-CI-01: CI=true requires TEST_DATABASE_URL (HAS_DB must be true)", () => {
    if (process.env.CI === "true") {
      expect(
        HAS_DB,
        "CI integration runs require TEST_DATABASE_URL secret — missing in this run",
      ).toBe(true);
    } else {
      // Local dev without CI set: no-op pass-through. Developers without a
      // provisioned test DB must still be able to run unit tests + see the
      // integration suite skip cleanly.
      expect(true).toBe(true);
    }
  });

  it("T-PA4-CI-02: package.json test:integration script must not carry --passWithNoTests", () => {
    // Sanity on the setup module export — catches accidental type regression.
    expect(typeof HAS_DB).toBe("boolean");

    // Regression guard: prevent accidental re-introduction of
    // --passWithNoTests on the integration gate (which was the original
    // silent-green vector this tranche closes). The flag remains legitimate
    // on test:authz / test:regression / test:money:edge / test:auth:full
    // whose directories are empty until their own hardening tranches.
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.["test:integration"] ?? "";
    expect(
      script,
      "test:integration must not contain --passWithNoTests (P-audit-4 regression guard)",
    ).not.toMatch(/--passWithNoTests/);
  });
});
