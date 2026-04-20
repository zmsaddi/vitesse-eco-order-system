import { beforeAll, describe, expect, it } from "vitest";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// D-79: route-level idempotency wrapper — required/optional + owner/request mismatch.
// Uses a synthetic endpoint string ("TEST /integration/idempotency") + real DB writes.

describe.skipIf(!HAS_DB)("D-79 withIdempotencyRoute (requires TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    await resetSchema();
    await applyMigrations();
  });

  function makeReq(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/test", {
      method: "POST",
      headers,
    });
  }

  it("optional + missing header → pass-through (handler runs once)", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    let runs = 0;
    const res = await withIdempotencyRoute(
      makeReq(),
      {
        endpoint: "TEST /idempotency/optional",
        username: "alice",
        body: { a: 1 },
        requireHeader: "optional",
      },
      async () => {
        runs++;
        return { status: 200, body: { ok: true } };
      },
    );
    expect(runs).toBe(1);
    expect(res.status).toBe(200);
  });

  it("required + missing header → 400 IDEMPOTENCY_KEY_REQUIRED (handler not run)", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    let runs = 0;
    const res = await withIdempotencyRoute(
      makeReq(),
      {
        endpoint: "TEST /idempotency/required",
        username: "alice",
        body: { a: 1 },
        requireHeader: "required",
      },
      async () => {
        runs++;
        return { status: 200, body: { ok: true } };
      },
    );
    expect(runs).toBe(0);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("required + header present + first call runs handler + inserts row", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    let runs = 0;
    const res = await withIdempotencyRoute(
      makeReq({ "Idempotency-Key": "key-1" }),
      {
        endpoint: "TEST /idempotency/required",
        username: "alice",
        body: { a: 1 },
        requireHeader: "required",
      },
      async () => {
        runs++;
        return { status: 201, body: { created: true } };
      },
    );
    expect(runs).toBe(1);
    expect(res.status).toBe(201);
  });

  it("replay same key + same body → cached (handler NOT run)", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    let runs = 0;
    const res = await withIdempotencyRoute(
      makeReq({ "Idempotency-Key": "key-1" }),
      {
        endpoint: "TEST /idempotency/required",
        username: "alice",
        body: { a: 1 },
        requireHeader: "required",
      },
      async () => {
        runs++;
        return { status: 500, body: { fresh: true } };
      },
    );
    expect(runs).toBe(0);
    expect(res.status).toBe(201); // cached status
    const body = (await res.json()) as { created?: boolean; fresh?: boolean };
    expect(body.created).toBe(true); // cached body
    expect(body.fresh).toBeUndefined();
  });

  it("same key + different body → 409 IDEMPOTENCY_KEY_MISMATCH", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    const res = await withIdempotencyRoute(
      makeReq({ "Idempotency-Key": "key-1" }),
      {
        endpoint: "TEST /idempotency/required",
        username: "alice",
        body: { a: 2 }, // different body
        requireHeader: "required",
      },
      async () => ({ status: 200, body: {} }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_KEY_MISMATCH");
  });

  it("same key + different username → 409 IDEMPOTENCY_KEY_OWNER_MISMATCH", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    const res = await withIdempotencyRoute(
      makeReq({ "Idempotency-Key": "key-1" }),
      {
        endpoint: "TEST /idempotency/required",
        username: "bob", // different
        body: { a: 1 },
        requireHeader: "required",
      },
      async () => ({ status: 200, body: {} }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_KEY_OWNER_MISMATCH");
  });

  it("different endpoint with same key is independent (PK is (key, endpoint))", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    let runs = 0;
    const res = await withIdempotencyRoute(
      makeReq({ "Idempotency-Key": "key-1" }), // same key, different endpoint
      {
        endpoint: "TEST /idempotency/other",
        username: "alice",
        body: { a: 1 },
        requireHeader: "required",
      },
      async () => {
        runs++;
        return { status: 201, body: { fresh: true } };
      },
    );
    expect(runs).toBe(1);
    expect(res.status).toBe(201);
  });

  it("failed handler → rollback (no row stored) → retry executes fresh", async () => {
    const { withIdempotencyRoute } = await import("@/lib/idempotency");
    let runs = 0;
    // First call fails inside handler — wrapper catches + returns 500.
    const res1 = await withIdempotencyRoute(
      makeReq({ "Idempotency-Key": "key-fail" }),
      {
        endpoint: "TEST /idempotency/required",
        username: "alice",
        body: { x: 1 },
        requireHeader: "required",
      },
      async () => {
        runs++;
        throw new Error("boom");
      },
    );
    expect(res1.status).toBe(500);
    expect(runs).toBe(1);

    // Second call: no cached row (since first rolled back), handler runs again.
    const res2 = await withIdempotencyRoute(
      makeReq({ "Idempotency-Key": "key-fail" }),
      {
        endpoint: "TEST /idempotency/required",
        username: "alice",
        body: { x: 1 },
        requireHeader: "required",
      },
      async () => {
        runs++;
        return { status: 201, body: { ok: true } };
      },
    );
    expect(res2.status).toBe(201);
    expect(runs).toBe(2); // handler ran twice — fresh on second.
  });
});
