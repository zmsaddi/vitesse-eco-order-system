import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HAS_DB } from "../integration/setup";

// P-audit-2 — CI integration hard-fail guard for the authorization matrix.
//
// Same structural pattern as P-audit-4 (tests/integration/ci-guard.test.ts)
// and P-audit-1 (tests/regression/guard-and-auth.test.ts). No describe.skipIf
// on the guard block — it MUST execute under every invocation so a
// CI-without-secret run fails loudly instead of exiting silent-green.

describe("P-audit-2 authz guard", () => {
  it("T-PA2-GUARD-01: CI=true requires TEST_DATABASE_URL (HAS_DB must be true)", () => {
    if (process.env.CI === "true") {
      expect(
        HAS_DB,
        "CI authz runs require TEST_DATABASE_URL secret — missing in this run",
      ).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });

  it("T-PA2-GUARD-02: package.json test:authz must not carry --passWithNoTests", () => {
    expect(typeof HAS_DB).toBe("boolean");
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.["test:authz"] ?? "";
    expect(
      script,
      "test:authz must not contain --passWithNoTests (P-audit-2 regression guard)",
    ).not.toMatch(/--passWithNoTests/);
  });
});
