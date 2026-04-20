import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.1.2 — three reviewer-flagged gaps against 9b25320:
//   1. costPrice leaked to seller via OrderDto (POST + GET).
//   2. VIN_DUPLICATE normalization gap: stored raw, compared only with LOWER().
//   3. VIN_DUPLICATE race: concurrent creates with disjoint products could
//      both insert the same VIN because product locks didn't serialize them.

describe.skipIf(!HAS_DB)("Phase 3.1.2 fixes (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let clientId: number;
  let productBikeId: number;     // VIN-required category
  let productAccessoryId: number; // non-VIN
  let productBike2Id: number;     // second bike for race test

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

    const { withRead, withTxInRoute } = await import("@/db/client");
    const { users, clients, products, settings } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    const hash = await hashPassword("test-pass-3.1.2");
    sellerId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(users)
          .values({
            username: "sel-312",
            password: hash,
            name: "Seller 3.1.2",
            role: "seller",
            active: true,
          })
          .returning(),
      )
    )[0].id;

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 3.1.2", phone: "+33600312001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    [productBikeId, productBike2Id, productAccessoryId] = await withTxInRoute(
      undefined,
      async (tx) => {
        const bike = await tx
          .insert(products)
          .values({
            name: "دراجة A",
            category: "دراجات كهربائية",
            buyPrice: "500.00",
            sellPrice: "1000.00",
            stock: "100.00",
            createdBy: "admin",
          })
          .returning();
        const bike2 = await tx
          .insert(products)
          .values({
            name: "دراجة B",
            category: "دراجات كهربائية",
            buyPrice: "500.00",
            sellPrice: "1000.00",
            stock: "100.00",
            createdBy: "admin",
          })
          .returning();
        const acc = await tx
          .insert(products)
          .values({
            name: "إكسسوار A",
            category: "إكسسوار",
            buyPrice: "30.00",
            sellPrice: "100.00",
            stock: "100.00",
            createdBy: "admin",
          })
          .returning();
        const toUpsert = [
          { key: "vin_required_categories", value: JSON.stringify(["دراجات كهربائية"]) },
          { key: "max_discount_seller_pct", value: "5" },
        ];
        for (const s of toUpsert) {
          await tx
            .insert(settings)
            .values(s)
            .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
        }
        return [bike[0].id, bike2[0].id, acc[0].id];
      },
    );
  });

  function mockSession(user: { id: number; username: string; role: string; name: string }) {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: String(user.id), username: user.username, role: user.role, name: user.name },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshRoutes(user: { id: number; username: string; role: string; name: string }) {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession(user);
    return {
      orders: await import("@/app/api/v1/orders/route"),
      ordersDetail: await import("@/app/api/v1/orders/[id]/route"),
    };
  }

  // ─────────── Fix 1: seller does NOT see costPrice in POST response ───────────

  it("Fix 1 — seller POST /orders response: items[*] has NO costPrice key", async () => {
    const r = await freshRoutes({
      id: sellerId,
      username: "sel-312",
      role: "seller",
      name: "S",
    });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productAccessoryId, quantity: 1, unitPrice: 100 }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const rawText = await res.text();
    expect(rawText).not.toContain("costPrice");
    expect(rawText).not.toContain("cost_price");
    const body = JSON.parse(rawText) as {
      order: { id: number; items: Array<Record<string, unknown>> };
    };
    expect(body.order.items[0]).not.toHaveProperty("costPrice");
  });

  it("Fix 1 — admin POST /orders response DOES include costPrice", async () => {
    const r = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productAccessoryId, quantity: 1, unitPrice: 100 }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      order: { id: number; items: Array<Record<string, unknown>> };
    };
    expect(body.order.items[0]).toHaveProperty("costPrice");
  });

  it("Fix 1 — seller GET /orders/[id] (own order) does NOT leak costPrice", async () => {
    // seller creates first
    const rSeller = await freshRoutes({
      id: sellerId,
      username: "sel-312",
      role: "seller",
      name: "S",
    });
    const create = await rSeller.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productAccessoryId, quantity: 1, unitPrice: 100 }],
        }),
      }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { order: { id: number } };

    const rSeller2 = await freshRoutes({
      id: sellerId,
      username: "sel-312",
      role: "seller",
      name: "S",
    });
    const getRes = await rSeller2.ordersDetail.GET(
      new Request(`http://localhost/api/v1/orders/${created.order.id}`),
      { params: Promise.resolve({ id: String(created.order.id) }) },
    );
    expect(getRes.status).toBe(200);
    const txt = await getRes.text();
    expect(txt).not.toContain("costPrice");
  });

  // ─────────── Fix 2: VIN normalization (stored trim, compared LOWER+TRIM) ───────────

  it("Fix 2 — stored VIN is trimmed", async () => {
    const r = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            {
              productId: productBikeId,
              quantity: 1,
              unitPrice: 1000,
              vin: "  VIN-TRIM-001  ",
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { order: { items: Array<{ vin: string }> } };
    expect(body.order.items[0].vin).toBe("VIN-TRIM-001"); // trimmed
  });

  it("Fix 2 — VIN with surrounding whitespace conflicts with same VIN stored earlier", async () => {
    // First order: trimmed VIN stored.
    const r1 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const first = await r1.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: " VIN-NORM-1 " },
          ],
        }),
      }),
    );
    expect(first.status).toBe(201);

    // Second order: same VIN (different casing + no whitespace) → must 409.
    const r2 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const second = await r2.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBike2Id, quantity: 1, unitPrice: 1000, vin: "vin-norm-1" },
          ],
        }),
      }),
    );
    expect(second.status).toBe(409);
    const body = (await second.json()) as { code: string };
    expect(body.code).toBe("VIN_DUPLICATE");
  });

  // ─────────── Fix 3: race-safe VIN under concurrent creates with disjoint products ───────────

  it("Fix 3 — concurrent POSTs with DISJOINT product sets + SAME VIN → exactly one succeeds", async () => {
    // r1 uses productBikeId; r2 uses productBike2Id. Neither contends on product locks.
    // Without a VIN advisory lock, both would pass the cross-order check and insert.
    // With Phase 3.1.2's advisory lock keyed on hashtext("vin:" + normalized),
    // one tx serializes on the lock; when it commits, the second sees the row.
    const r1 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const r2 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });

    const [res1, res2] = await Promise.all([
      r1.orders.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-20",
            items: [
              { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-RACE-001" },
            ],
          }),
        }),
      ),
      r2.orders.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-20",
            items: [
              { productId: productBike2Id, quantity: 1, unitPrice: 1000, vin: "VIN-RACE-001" },
            ],
          }),
        }),
      ),
    ]);
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failedIdx = res1.status === 409 ? 0 : 1;
    const failed = failedIdx === 0 ? res1 : res2;
    const body = (await failed.json()) as { code: string };
    expect(body.code).toBe("VIN_DUPLICATE");
  });

  it("Fix 3 — concurrent POSTs with disjoint products + DIFFERENT VINs both succeed", async () => {
    const r1 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const r2 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });

    const [res1, res2] = await Promise.all([
      r1.orders.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-20",
            items: [
              { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-DIFF-A" },
            ],
          }),
        }),
      ),
      r2.orders.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-20",
            items: [
              { productId: productBike2Id, quantity: 1, unitPrice: 1000, vin: "VIN-DIFF-B" },
            ],
          }),
        }),
      ),
    ]);
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });
});
