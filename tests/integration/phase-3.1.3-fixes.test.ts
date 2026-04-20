import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.1.3 — commissionRuleSnapshot per-role redaction.
// Previously, the full snapshot (including driver_fixed_per_delivery) was echoed
// to sellers via every order response surface. Now:
//   - seller: source + captured_at + seller_fixed_per_unit + seller_pct_overage
//   - driver: source + captured_at + driver_fixed_per_delivery
//   - stock_keeper: snapshot stripped entirely (no commission standing)
//   - pm/gm/manager: unchanged — full snapshot

describe.skipIf(!HAS_DB)("Phase 3.1.3 snapshot redaction (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let stockKeeperId: number;
  let clientId: number;
  let productBikeId: number;
  let productAccessoryId: number;

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
    const { users, clients, products, settings, productCommissionRules } =
      await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    const hash = await hashPassword("test-pass-3.1.3");
    [sellerId, stockKeeperId] = await withTxInRoute(undefined, async (tx) => {
      const seller = await tx
        .insert(users)
        .values({
          username: "sel-313",
          password: hash,
          name: "Seller 3.1.3",
          role: "seller",
          active: true,
        })
        .returning();
      const sk = await tx
        .insert(users)
        .values({
          username: "sk-313",
          password: hash,
          name: "SK 3.1.3",
          role: "stock_keeper",
          active: true,
        })
        .returning();
      return [seller[0].id, sk[0].id];
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 3.1.3", phone: "+33600313001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    [productBikeId, productAccessoryId] = await withTxInRoute(undefined, async (tx) => {
      const bike = await tx
        .insert(products)
        .values({
          name: "دراجة 3.1.3",
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
          name: "إكسسوار 3.1.3",
          category: "إكسسوار-313",
          buyPrice: "50.00",
          sellPrice: "100.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      const toUpsert = [
        { key: "vin_required_categories", value: JSON.stringify(["دراجات كهربائية"]) },
        { key: "seller_bonus_fixed", value: "10" },
        { key: "seller_bonus_percentage", value: "2" },
        { key: "driver_bonus_fixed", value: "8" },
      ];
      for (const s of toUpsert) {
        await tx
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
      }
      // Per-category rule for bikes so the snapshot carries driver_fixed_per_delivery.
      await tx
        .insert(productCommissionRules)
        .values({
          category: "دراجات كهربائية",
          sellerFixedPerUnit: "30",
          sellerPctOverage: "4",
          driverFixedPerDelivery: "12",
          active: true,
        })
        .onConflictDoNothing({ target: productCommissionRules.category });
      return [bike[0].id, acc[0].id];
    });
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
      startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      preparation: await import("@/app/api/v1/preparation/route"),
    };
  }

  // ─────────── seller POST /orders → snapshot filtered ───────────

  it("seller POST /orders: response snapshot omits driver_fixed_per_delivery", async () => {
    const r = await freshRoutes({
      id: sellerId,
      username: "sel-313",
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
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-313-SELL-1" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const rawText = await res.text();
    expect(rawText).not.toContain("driver_fixed_per_delivery");
    const body = JSON.parse(rawText) as {
      order: { items: Array<{ commissionRuleSnapshot: Record<string, unknown> }> };
    };
    const snap = body.order.items[0].commissionRuleSnapshot;
    expect(snap).toBeDefined();
    expect(snap.seller_fixed_per_unit).toBe(30);
    expect(snap.seller_pct_overage).toBe(4);
    expect("driver_fixed_per_delivery" in snap).toBe(false);
  });

  it("seller GET /orders/[id] (own): snapshot omits driver_fixed_per_delivery", async () => {
    const rSeller = await freshRoutes({
      id: sellerId,
      username: "sel-313",
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
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-313-SELL-2" },
          ],
        }),
      }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { order: { id: number } };

    const rSeller2 = await freshRoutes({
      id: sellerId,
      username: "sel-313",
      role: "seller",
      name: "S",
    });
    const getRes = await rSeller2.ordersDetail.GET(
      new Request(`http://localhost/api/v1/orders/${created.order.id}`),
      { params: Promise.resolve({ id: String(created.order.id) }) },
    );
    expect(getRes.status).toBe(200);
    const rawText = await getRes.text();
    expect(rawText).not.toContain("driver_fixed_per_delivery");
  });

  // ─────────── admin keeps full snapshot ───────────

  it("admin POST /orders: snapshot includes driver_fixed_per_delivery (full view)", async () => {
    const r = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-313-ADMIN-1" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      order: { items: Array<{ commissionRuleSnapshot: Record<string, unknown> }> };
    };
    const snap = body.order.items[0].commissionRuleSnapshot;
    expect(snap.driver_fixed_per_delivery).toBe(12);
    expect(snap.seller_fixed_per_unit).toBe(30);
  });

  // ─────────── stock_keeper: snapshot stripped entirely ───────────

  it("stock_keeper GET /preparation: snapshot is absent on every returned order", async () => {
    // Seed a محجوز order first (by admin).
    const rAdmin = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    await rAdmin.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-313-PREP-1" },
          ],
        }),
      }),
    );

    const rSk = await freshRoutes({
      id: stockKeeperId,
      username: "sk-313",
      role: "stock_keeper",
      name: "SK",
    });
    const res = await rSk.preparation.GET(new Request("http://localhost/api/v1/preparation"));
    expect(res.status).toBe(200);
    const rawText = await res.text();
    expect(rawText).not.toContain("commissionRuleSnapshot");
    expect(rawText).not.toContain("driver_fixed_per_delivery");
    expect(rawText).not.toContain("seller_fixed_per_unit");
    expect(rawText).not.toContain("costPrice");
    const body = JSON.parse(rawText) as {
      orders: Array<{ items: Array<Record<string, unknown>>; status: string }>;
    };
    for (const o of body.orders) {
      for (const item of o.items) {
        expect("commissionRuleSnapshot" in item).toBe(false);
        expect("costPrice" in item).toBe(false);
      }
    }
  });

  it("stock_keeper start-preparation echo: snapshot absent in the response", async () => {
    // Create an order we can transition.
    const rAdmin = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const create = await rAdmin.orders.POST(
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

    const rSk = await freshRoutes({
      id: stockKeeperId,
      username: "sk-313",
      role: "stock_keeper",
      name: "SK",
    });
    const startRes = await rSk.startPrep.POST(
      new Request(
        `http://localhost/api/v1/orders/${created.order.id}/start-preparation`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `313-start-${created.order.id}` },
        },
      ),
      { params: Promise.resolve({ id: String(created.order.id) }) },
    );
    expect(startRes.status).toBe(200);
    const rawText = await startRes.text();
    expect(rawText).not.toContain("commissionRuleSnapshot");
    expect(rawText).not.toContain("costPrice");
    expect(rawText).not.toContain("seller_fixed_per_unit");
    expect(rawText).not.toContain("driver_fixed_per_delivery");
  });
});
