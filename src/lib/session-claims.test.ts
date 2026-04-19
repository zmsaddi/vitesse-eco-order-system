import { describe, expect, it } from "vitest";
import { getSessionClaims, requireClaims, requireRole } from "./session-claims";

// D-67: Phase 0 stub returns null until Phase 1 wires Auth.js.
// Phase 1 replaces these tests with real session extraction coverage.

describe("session-claims stub (Phase 0)", () => {
  it("getSessionClaims returns null until Phase 1", async () => {
    const req = new Request("http://x.test/");
    await expect(getSessionClaims(req)).resolves.toBeNull();
  });

  it("requireClaims throws AuthError when no session", async () => {
    const req = new Request("http://x.test/");
    await expect(requireClaims(req)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("requireRole throws AuthError (not PermissionError) when no session", async () => {
    const req = new Request("http://x.test/");
    // No claims → auth fails first (401), not 403.
    await expect(requireRole(req, "pm")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
