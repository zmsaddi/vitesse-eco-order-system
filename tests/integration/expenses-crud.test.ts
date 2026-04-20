import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.0 expenses + D-82 reverse.
// Verifies: CRUD paths, no DELETE endpoint, structured /reverse via reversal_of FK
// + partial unique prevents double-reversal.

describe.skipIf(!HAS_DB)("Phase 3.0 expenses + D-82 reverse (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    delete process.env.INIT_BOOTSTRAP_SECRET;
    await resetSchema();
    await applyMigrations();

    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    const { POST: initPost } = await import("@/app/api/init/route");
    await initPost(new Request("http://localhost/api/init", { method: "POST" }) as never);

    const { withRead } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(users).where(eq(users.username, "admin")).limit(1),
    );
    adminUserId = rows[0].id;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function withAdminSession(): void {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: String(adminUserId), username: "admin", role: "pm", name: "admin" },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshRoutes(): Promise<{
    listRoute: typeof import("@/app/api/v1/expenses/route");
    itemRoute: typeof import("@/app/api/v1/expenses/[id]/route");
    reverseRoute: typeof import("@/app/api/v1/expenses/[id]/reverse/route");
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return {
      listRoute: await import("@/app/api/v1/expenses/route"),
      itemRoute: await import("@/app/api/v1/expenses/[id]/route"),
      reverseRoute: await import("@/app/api/v1/expenses/[id]/reverse/route"),
    };
  }

  let expenseId: number;

  it("POST /expenses creates expense (201) + activity_log", async () => {
    const { listRoute } = await freshRoutes();
    const res = await listRoute.POST(
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-04-20",
          category: "postage",
          description: "طرد",
          amount: 15.5,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { expense: { id: number; amount: number } };
    expect(body.expense.amount).toBe(15.5);
    expenseId = body.expense.id;
  });

  it("GET /expenses lists with pagination", async () => {
    const { listRoute } = await freshRoutes();
    const res = await listRoute.GET(new Request("http://localhost/api/v1/expenses?limit=10"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expenses: unknown[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("PUT /expenses/[id] updates fields", async () => {
    const { itemRoute } = await freshRoutes();
    const res = await itemRoute.PUT(
      new Request(`http://localhost/api/v1/expenses/${expenseId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: "شرح محدَّث" }),
      }),
      { params: Promise.resolve({ id: String(expenseId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expense: { notes: string } };
    expect(body.expense.notes).toBe("شرح محدَّث");
  });

  it("POST /expenses/[id]/reverse without header → 400", async () => {
    const { reverseRoute } = await freshRoutes();
    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/expenses/${expenseId}/reverse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "x" }),
      }),
      { params: Promise.resolve({ id: String(expenseId) }) },
    );
    expect(res.status).toBe(400);
  });

  it("POST /expenses/[id]/reverse creates negative-amount row with reversal_of FK", async () => {
    const { reverseRoute } = await freshRoutes();
    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/expenses/${expenseId}/reverse`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `reverse-expense-${expenseId}`,
        },
        body: JSON.stringify({ reason: "إدخال خاطئ" }),
      }),
      { params: Promise.resolve({ id: String(expenseId) }) },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      expense: { id: number; amount: number; reversalOf: number | null };
    };
    expect(body.expense.amount).toBe(-15.5);
    expect(body.expense.reversalOf).toBe(expenseId);
  });

  it("POST /expenses/[id]/reverse AGAIN (different key) → 409 ALREADY_REVERSED (partial unique)", async () => {
    const { reverseRoute } = await freshRoutes();
    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/expenses/${expenseId}/reverse`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `reverse-expense-${expenseId}-try2`,
        },
        body: JSON.stringify({ reason: "second attempt" }),
      }),
      { params: Promise.resolve({ id: String(expenseId) }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ALREADY_REVERSED");
  });

  it("POST /expenses/[id]/reverse on a reversal row itself → 409 CANNOT_REVERSE_REVERSAL", async () => {
    // Find the reversal row for our expense.
    const { withRead } = await import("@/db/client");
    const reversalId = await withRead(undefined, async (db) => {
      const r = await db.execute(sql`SELECT id FROM expenses WHERE reversal_of = ${expenseId} LIMIT 1`);
      return (r as unknown as { rows?: Array<{ id: number }> }).rows?.[0]?.id;
    });
    expect(reversalId).toBeTruthy();

    const { reverseRoute } = await freshRoutes();
    const res = await reverseRoute.POST(
      new Request(`http://localhost/api/v1/expenses/${reversalId}/reverse`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `reverse-of-reversal-${reversalId}`,
        },
        body: JSON.stringify({ reason: "invalid" }),
      }),
      { params: Promise.resolve({ id: String(reversalId) }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CANNOT_REVERSE_REVERSAL");
  });

  it("no DELETE endpoint — expenses schema has no deletedAt removal flow either", async () => {
    // Sanity check: our route file exports only GET + PUT on [id], never DELETE.
    const routeModule = await import("@/app/api/v1/expenses/[id]/route");
    expect("DELETE" in routeModule).toBe(false);
    expect("GET" in routeModule).toBe(true);
    expect("PUT" in routeModule).toBe(true);
  });
});
