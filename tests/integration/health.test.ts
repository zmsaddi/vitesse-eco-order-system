import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

// /api/health — public probe (no auth, no DB). Runs without TEST_DATABASE_URL.
describe("/api/health — public probe", () => {
  it("GET returns { ok: true, timestamp, env }", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; timestamp: string; env: string };
    expect(body.ok).toBe(true);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    expect(typeof body.env).toBe("string");
  });

  it("probe is cheap — no DB roundtrip (response arrives instantly)", async () => {
    const start = Date.now();
    await GET();
    expect(Date.now() - start).toBeLessThan(100);
  });
});
