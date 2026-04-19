import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock @/auth at top-level (hoisted by vitest).
// This prevents chaining into next-auth→next/server at load time (ESM/CJS resolution issue).
const mockAuth = vi.fn<() => Promise<unknown>>();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { ALL_ROLES, getSessionClaims, requireClaims, requireRole } from "./session-claims";

describe("session-claims (Phase 1 wired to Auth.js)", () => {
  beforeEach(() => {
    mockAuth.mockReset();
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
});
