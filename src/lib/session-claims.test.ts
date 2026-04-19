import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock @/auth at top-level (hoisted by vitest).
// This prevents chaining into next-auth→next/server at load time (ESM/CJS resolution issue).
const mockAuth = vi.fn<() => Promise<unknown>>();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

// Mock next/navigation redirect — Next.js makes redirect() throw a special
// control-flow error. We replicate that behavior so tests can assert the thrown
// payload carries the intended target path.
const mockRedirect = vi.fn<(url: string) => never>();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    // Next.js signals redirect via a thrown sentinel. Throw a matching shape so
    // enforcePageRole stops execution like it would in production.
    const err = new Error("NEXT_REDIRECT");
    (err as { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  },
}));

import {
  ALL_ROLES,
  enforcePageRole,
  getSessionClaims,
  requireClaims,
  requireRole,
} from "./session-claims";

describe("session-claims (Phase 1 wired to Auth.js)", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRedirect.mockReset();
  });

  it("getSessionClaims returns null when auth() yields no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await expect(getSessionClaims()).resolves.toBeNull();
  });

  it("getSessionClaims returns null when session lacks required fields", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "1" /* missing username+role */ } });
    await expect(getSessionClaims()).resolves.toBeNull();
  });

  it("getSessionClaims returns typed claims when session is complete", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "42", username: "admin", role: "pm", name: "مدير المشروع" },
    });
    const claims = await getSessionClaims();
    expect(claims).toEqual({
      userId: 42,
      username: "admin",
      role: "pm",
      name: "مدير المشروع",
    });
  });

  it("requireClaims throws AuthError when session missing", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await expect(requireClaims()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("requireRole throws PermissionError when role mismatches", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "1", username: "bob", role: "seller", name: "Bob" },
    });
    await expect(requireRole(undefined, "pm")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("requireRole returns claims when role matches (array form)", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "2", username: "jane", role: "manager", name: "Jane" },
    });
    const claims = await requireRole(undefined, ["pm", "gm", "manager"]);
    expect(claims.role).toBe("manager");
    expect(claims.userId).toBe(2);
  });

  it("ALL_ROLES enumerates all 6 canonical roles", () => {
    expect(ALL_ROLES).toEqual([
      "pm",
      "gm",
      "manager",
      "seller",
      "driver",
      "stock_keeper",
    ]);
  });

  // ─────────────────────────────────────────────────────
  // enforcePageRole — SSR page guard (Phase 2.1)
  //
  // Unlike requireRole() which throws, this helper calls next/navigation's
  // redirect() which itself throws a NEXT_REDIRECT sentinel. Tests assert both:
  //   (a) the correct target URL was passed to redirect()
  //   (b) the sentinel was thrown so Next.js stops page rendering
  // ─────────────────────────────────────────────────────

  describe("enforcePageRole — SSR page guard (Phase 2.1)", () => {
    it("no session → redirects to /login (NOT a throw)", async () => {
      mockAuth.mockResolvedValueOnce(null);
      await expect(enforcePageRole(["pm"])).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
      });
      expect(mockRedirect).toHaveBeenCalledOnce();
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("wrong role → redirects to that role's home (D-72)", async () => {
      // Seller tries to access a pm-only page.
      mockAuth.mockResolvedValueOnce({
        user: { id: "7", username: "selly", role: "seller", name: "Seller" },
      });
      await expect(enforcePageRole(["pm", "gm"])).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
      });
      expect(mockRedirect).toHaveBeenCalledWith("/orders"); // seller's home
    });

    it("driver wrong-role → redirects to /driver-tasks", async () => {
      mockAuth.mockResolvedValueOnce({
        user: { id: "9", username: "drvr", role: "driver", name: "Driver" },
      });
      await expect(enforcePageRole(["pm"])).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
      });
      expect(mockRedirect).toHaveBeenCalledWith("/driver-tasks");
    });

    it("manager wrong-role → redirects to /action-hub", async () => {
      mockAuth.mockResolvedValueOnce({
        user: { id: "3", username: "mgr", role: "manager", name: "Mgr" },
      });
      await expect(enforcePageRole(["seller", "driver"])).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
      });
      expect(mockRedirect).toHaveBeenCalledWith("/action-hub");
    });

    it("correct role → returns claims, no redirect", async () => {
      mockAuth.mockResolvedValueOnce({
        user: { id: "1", username: "admin", role: "pm", name: "مدير" },
      });
      const claims = await enforcePageRole(["pm", "gm"]);
      expect(claims).toEqual({
        userId: 1,
        username: "admin",
        role: "pm",
        name: "مدير",
      });
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("array form accepts any of multiple allowed roles", async () => {
      mockAuth.mockResolvedValueOnce({
        user: { id: "5", username: "m1", role: "manager", name: "M" },
      });
      const claims = await enforcePageRole(["pm", "gm", "manager"]);
      expect(claims.role).toBe("manager");
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("single-role form (not array) works", async () => {
      mockAuth.mockResolvedValueOnce({
        user: { id: "2", username: "p", role: "pm", name: "P" },
      });
      const claims = await enforcePageRole("pm");
      expect(claims.role).toBe("pm");
    });

    it("does NOT throw PermissionError (unlike requireRole)", async () => {
      mockAuth.mockResolvedValueOnce({
        user: { id: "7", username: "s", role: "seller", name: "S" },
      });
      // Should throw NEXT_REDIRECT, NOT a PermissionError(403).
      await expect(enforcePageRole(["pm"])).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
      });
      await expect(enforcePageRole(["pm"])).rejects.not.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });
});
