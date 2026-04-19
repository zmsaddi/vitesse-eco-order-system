import { afterEach, describe, expect, it, vi } from "vitest";

// Mock @/db/client at top-level (hoisted) so can() never hits real env/DB.
// The DB-empty-row branch is covered here; real DB integration lives in tests/integration/.
const mockSelect = vi.fn<() => Promise<unknown[]>>();
vi.mock("@/db/client", () => ({
  withRead: async (_ctx: unknown, fn: (db: unknown) => Promise<unknown>) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => mockSelect(),
          }),
        }),
      }),
    }),
}));

import { __primeCacheForTesting, can, invalidatePermissionsCache } from "./can";

describe("can() permission helper (D-12)", () => {
  afterEach(() => {
    invalidatePermissionsCache();
    mockSelect.mockReset();
  });

  it("returns true when cache says allowed", async () => {
    __primeCacheForTesting("pm", "orders", "view", true);
    await expect(can("pm", "orders", "view")).resolves.toBe(true);
    expect(mockSelect).not.toHaveBeenCalled(); // cache hit → no DB
  });

  it("returns false when cache says denied", async () => {
    __primeCacheForTesting("seller", "distributions", "create", false);
    await expect(can("seller", "distributions", "create")).resolves.toBe(false);
  });

  it("cache is keyed by role+resource+action (no cross-talk)", async () => {
    __primeCacheForTesting("pm", "orders", "view", true);
    __primeCacheForTesting("seller", "orders", "view", false);
    await expect(can("pm", "orders", "view")).resolves.toBe(true);
    await expect(can("seller", "orders", "view")).resolves.toBe(false);
  });

  it("hits DB on cache miss, returns allowed=true when row exists", async () => {
    mockSelect.mockResolvedValueOnce([{ allowed: true }]);
    await expect(can("pm", "orders", "create")).resolves.toBe(true);
    expect(mockSelect).toHaveBeenCalledOnce();
  });

  it("second call uses cache (no second DB hit)", async () => {
    mockSelect.mockResolvedValueOnce([{ allowed: true }]);
    await can("pm", "orders", "edit");
    await can("pm", "orders", "edit");
    expect(mockSelect).toHaveBeenCalledOnce();
  });

  it("default-denies unknown role/resource/action (no DB row)", async () => {
    mockSelect.mockResolvedValueOnce([]);
    await expect(can("driver", "unknown_resource", "nuke")).resolves.toBe(false);
  });

  it("invalidatePermissionsCache() forces next call to hit DB again", async () => {
    mockSelect.mockResolvedValueOnce([{ allowed: true }]);
    await can("pm", "orders", "approve");
    invalidatePermissionsCache();
    mockSelect.mockResolvedValueOnce([{ allowed: false }]);
    await expect(can("pm", "orders", "approve")).resolves.toBe(false);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});
