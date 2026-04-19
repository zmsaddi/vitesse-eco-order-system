import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Integration tests for /api/v1/clients — POST + GET + PUT with duplicate guards.
// Validates Phase 2b.1 fixes: partial unique indexes + update dup-check + 23505 mapping.
// SKIPPED without TEST_DATABASE_URL.

describe.skipIf(!HAS_DB)("/api/v1/clients — POST + PUT round-trip (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET ?? "test-secret-at-least-32-characters-long!!";
    delete process.env.INIT_BOOTSTRAP_SECRET;
    await resetSchema();
    await applyMigrations();

    // Seed admin via /api/init.
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    const { POST: initPost } = await import("@/app/api/init/route");
    const initRes = await initPost(
      new Request("http://localhost/api/init", { method: "POST" }) as never,
    );
    if (initRes.status !== 200) throw new Error(`init failed: ${initRes.status}`);

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
        user: {
          id: String(adminUserId),
          username: "admin",
          role: "pm",
          name: "مدير المشروع",
        },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshListRoute(): Promise<{
    POST: typeof import("@/app/api/v1/clients/route")["POST"];
    GET: typeof import("@/app/api/v1/clients/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/clients/route");
  }

  async function freshDynamicRoute(): Promise<{
    PUT: typeof import("@/app/api/v1/clients/[id]/route")["PUT"];
    GET: typeof import("@/app/api/v1/clients/[id]/route")["GET"];
  }> {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    withAdminSession();
    return await import("@/app/api/v1/clients/[id]/route");
  }

  it("POST creates a client with all fields", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "أحمد",
          phone: "+33612345678",
          email: "ahmed@example.com",
          address: "باريس",
          latinName: "Ahmed",
          descriptionAr: "",
          notes: "",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { client: { id: number; name: string } };
    expect(body.client.name).toBe("أحمد");
  });

  it("POST rejects duplicate (name, phone) with 409 DUPLICATE_CLIENT (axis=phone)", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "أحمد",
          phone: "+33612345678", // same as previous
          email: "other@example.com", // different email
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; details?: { axis?: string } };
    expect(body.code).toBe("DUPLICATE_CLIENT");
    expect(body.details?.axis).toBe("phone");
  });

  it("POST rejects duplicate (name, email) with 409 DUPLICATE_CLIENT (axis=email)", async () => {
    const { POST } = await freshListRoute();
    const res = await POST(
      new Request("http://localhost/api/v1/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "أحمد",
          phone: "+33611111111", // different phone
          email: "ahmed@example.com", // same email as first
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; details?: { axis?: string } };
    expect(body.code).toBe("DUPLICATE_CLIENT");
    expect(body.details?.axis).toBe("email");
  });

  it("POST allows same name when phone AND email are both empty (no partial index matches)", async () => {
    const { POST } = await freshListRoute();
    const res1 = await POST(
      new Request("http://localhost/api/v1/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "عميل بلا بيانات", phone: "", email: "" }),
      }),
    );
    expect(res1.status).toBe(201);

    // Second with same name, still no phone/email — should also succeed (no unique constraint fires).
    const res2 = await POST(
      new Request("http://localhost/api/v1/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "عميل بلا بيانات", phone: "", email: "" }),
      }),
    );
    expect(res2.status).toBe(201);
  });

  it("PUT on client with no changes to name/phone/email succeeds (idempotent self-update)", async () => {
    // Find the first client
    const { withRead } = await import("@/db/client");
    const { clients } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(clients).where(eq(clients.name, "أحمد")).limit(1),
    );
    const ahmedId = rows[0].id;

    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/clients/${ahmedId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "أحمد",                      // unchanged
          phone: "+33612345678",             // unchanged
          email: "ahmed@example.com",        // unchanged
          address: "باريس — العنوان الجديد",  // changed
          latinName: "Ahmed Updated",
          descriptionAr: "",
          notes: "",
        }),
      }),
      { params: Promise.resolve({ id: String(ahmedId) }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { client: { address: string } };
    expect(body.client.address).toContain("العنوان الجديد");
  });

  it("PUT that would create a (name, phone) duplicate with ANOTHER client → 409 (the Phase 2b.1 gap fix)", async () => {
    // First create a second client with a unique phone.
    const { POST } = await freshListRoute();
    await POST(
      new Request("http://localhost/api/v1/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "فاطمة",
          phone: "+33699999999",
          email: "",
        }),
      }),
    );

    // Find fatma's id
    const { withRead } = await import("@/db/client");
    const { clients } = await import("@/db/schema");
    const rows = await withRead(undefined, async (db) =>
      db.select().from(clients).where(eq(clients.name, "فاطمة")).limit(1),
    );
    const fatmaId = rows[0].id;

    // Now try to UPDATE fatma to collide with أحمد's (name, phone).
    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request(`http://localhost/api/v1/clients/${fatmaId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "أحمد",                // match ahmed
          phone: "+33612345678",       // match ahmed's phone
          email: "",
          address: "",
          latinName: "",
          descriptionAr: "",
          notes: "",
        }),
      }),
      { params: Promise.resolve({ id: String(fatmaId) }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; details?: { axis?: string } };
    expect(body.code).toBe("DUPLICATE_CLIENT");
    expect(body.details?.axis).toBe("phone");
  });

  it("PUT with missing client id → 404 NOT_FOUND", async () => {
    const { PUT } = await freshDynamicRoute();
    const res = await PUT(
      new Request("http://localhost/api/v1/clients/999999", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "x",
          phone: "",
          email: "",
          address: "",
          latinName: "",
          descriptionAr: "",
          notes: "",
        }),
      }),
      { params: Promise.resolve({ id: "999999" }) },
    );
    expect(res.status).toBe(404);
  });

  it("Seller POST allowed but PUT returns 403", async () => {
    // Switch session to seller
    vi.resetModules();
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: "99", username: "s1", role: "seller", name: "Seller" },
      }),
    }));
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();

    const { POST } = await import("@/app/api/v1/clients/route");
    const createRes = await POST(
      new Request("http://localhost/api/v1/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "سيلرز_عميل", phone: "", email: "" }),
      }),
    );
    expect(createRes.status).toBe(201);

    // Seller PUT must be 403
    const { PUT } = await import("@/app/api/v1/clients/[id]/route");
    const res = await PUT(
      new Request("http://localhost/api/v1/clients/1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", phone: "", email: "", address: "", latinName: "", descriptionAr: "", notes: "" }),
      }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(403);
  });
});
