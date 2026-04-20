import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.1: discount engine + VIN enforcement + gift logic + commission snapshot
// + mark-ready + preparation queue. All four business-rule families exercised
// end-to-end on a live Neon branch.

describe.skipIf(!HAS_DB)("Phase 3.1 order business rules (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let managerId: number;
  let stockKeeperId: number;
  let clientId: number;
  let productBikeId: number;     // category requires VIN
  let productAccessoryId: number; // no VIN
  let productGiftId: number;      // in gift_pool

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
    const { users, clients, products, settings, giftPool, userBonusRates, productCommissionRules } =
      await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    const hash = await hashPassword("test-pass-3.1");
    [sellerId, managerId, stockKeeperId] = await withTxInRoute(undefined, async (tx) => {
      const seller = await tx
        .insert(users)
        .values({ username: "sel1", password: hash, name: "Seller 1", role: "seller", active: true })
        .returning();
      const manager = await tx
        .insert(users)
        .values({ username: "mgr1", password: hash, name: "Manager 1", role: "manager", active: true })
        .returning();
      const sk = await tx
        .insert(users)
        .values({ username: "sk1", password: hash, name: "SK 1", role: "stock_keeper", active: true })
        .returning();
      return [seller[0].id, manager[0].id, sk[0].id];
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 3.1", phone: "+33601000001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    // Product seeds — prices chosen so BR-03 triggers predictably.
    [productBikeId, productAccessoryId, productGiftId] = await withTxInRoute(
      undefined,
      async (tx) => {
        const bike = await tx
          .insert(products)
          .values({
            name: "دراجة كهربائية X",
            category: "دراجات كهربائية", // VIN-required when settings listed
            buyPrice: "500.00",
            sellPrice: "1000.00",
            stock: "100.00",
            createdBy: "admin",
          })
          .returning();
        const acc = await tx
          .insert(products)
          .values({
            name: "إكسسوار Y",
            category: "إكسسوار",
            buyPrice: "10.00",
            sellPrice: "100.00",
            stock: "100.00",
            createdBy: "admin",
          })
          .returning();
        const gift = await tx
          .insert(products)
          .values({
            name: "هدية Z",
            category: "إكسسوار",
            buyPrice: "5.00",
            sellPrice: "50.00",
            stock: "50.00",
            createdBy: "admin",
          })
          .returning();
        // Gift pool entry: 10 items of productGift earmarked.
        await tx.insert(giftPool).values({
          productId: gift[0].id,
          quantity: "10.00",
          createdBy: "admin",
        });
        // Settings: VIN required for bikes + discount caps. Upsert in case the
        // init/seed path pre-populated any of these keys.
        const toUpsert: Array<{ key: string; value: string }> = [
          { key: "vin_required_categories", value: JSON.stringify(["دراجات كهربائية"]) },
          { key: "max_discount_seller_pct", value: "5" },
          { key: "max_discount_manager_pct", value: "15" },
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
        // Per-category commission rule for bikes.
        await tx.insert(productCommissionRules).values({
          category: "دراجات كهربائية",
          sellerFixedPerUnit: "25",
          sellerPctOverage: "5",
          driverFixedPerDelivery: "15",
          active: true,
        });
        // User override for seller sel1.
        await tx.insert(userBonusRates).values({
          username: "sel1",
          sellerFixed: "50",
          sellerPercentage: null,
          driverFixed: null,
        });
        return [bike[0].id, acc[0].id, gift[0].id];
      },
    );
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockSession(user: { id: number; username: string; role: string; name: string }): void {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: { id: String(user.id), username: user.username, role: user.role, name: user.name },
        expires: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }));
  }

  async function freshWithSession(user: { id: number; username: string; role: string; name: string }) {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession(user);
    return {
      orders: await import("@/app/api/v1/orders/route"),
      ordersDetail: await import("@/app/api/v1/orders/[id]/route"),
      start: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      mark: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
      preparation: await import("@/app/api/v1/preparation/route"),
    };
  }

  // ─────────── VIN enforcement (BR-21 / BR-22) ───────────

  it("VIN missing on VIN-required category → 400 VIN_REQUIRED", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productBikeId, quantity: 1, unitPrice: 1000 }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VIN_REQUIRED");
  });

  it("VIN present on VIN-required category → 201", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-XYZ-001" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("VIN not required for non-listed category → accepts empty VIN", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
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
  });

  // ─────────── Discount caps (BR-41) ───────────

  it("Seller 6% discount → 403 DISCOUNT_OVER_LIMIT (cap=5%)", async () => {
    const r = await freshWithSession({ id: sellerId, username: "sel1", role: "seller", name: "S" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            {
              productId: productAccessoryId,
              quantity: 1,
              unitPrice: 100,
              discountType: "percent",
              discountValue: 6,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("DISCOUNT_OVER_LIMIT");
  });

  it("Seller 5% discount → 201 (at cap)", async () => {
    const r = await freshWithSession({ id: sellerId, username: "sel1", role: "seller", name: "S" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            {
              productId: productAccessoryId,
              quantity: 1,
              unitPrice: 100,
              discountType: "percent",
              discountValue: 5,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      order: { items: Array<{ unitPrice: number; discountType: string; discountValue: number }> };
    };
    expect(body.order.items[0].unitPrice).toBe(95);
    expect(body.order.items[0].discountType).toBe("percent");
    expect(body.order.items[0].discountValue).toBe(5);
  });

  it("Manager 16% discount → 403 (cap=15%)", async () => {
    const r = await freshWithSession({ id: managerId, username: "mgr1", role: "manager", name: "M" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            {
              productId: productAccessoryId,
              quantity: 1,
              unitPrice: 100,
              discountType: "percent",
              discountValue: 16,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("PM 50% discount → 201 (unlimited)", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            {
              productId: productAccessoryId,
              quantity: 1,
              unitPrice: 100,
              discountType: "percent",
              discountValue: 50,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("Fixed discount type → applied to unitPrice", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            {
              productId: productAccessoryId,
              quantity: 1,
              unitPrice: 100,
              discountType: "fixed",
              discountValue: 20,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      order: { items: Array<{ unitPrice: number; discountType: string; discountValue: number }> };
    };
    expect(body.order.items[0].unitPrice).toBe(80);
    expect(body.order.items[0].discountType).toBe("fixed");
    expect(body.order.items[0].discountValue).toBe(20);
  });

  // ─────────── Gift logic (BR-35..39) ───────────

  it("Gift: creates order_item with unitPrice=0 + line_total=0 + gift_pool decremented", async () => {
    const { withRead } = await import("@/db/client");
    const { giftPool } = await import("@/db/schema");
    const beforeQty = (
      await withRead(undefined, (db) =>
        db.select().from(giftPool).where(eq(giftPool.productId, productGiftId)).limit(1),
      )
    )[0].quantity;

    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productGiftId, quantity: 2, unitPrice: 0, isGift: true }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      order: { items: Array<{ unitPrice: number; lineTotal: number; isGift: boolean }> };
    };
    expect(body.order.items[0].unitPrice).toBe(0);
    expect(body.order.items[0].lineTotal).toBe(0);
    expect(body.order.items[0].isGift).toBe(true);

    const afterQty = (
      await withRead(undefined, (db) =>
        db.select().from(giftPool).where(eq(giftPool.productId, productGiftId)).limit(1),
      )
    )[0].quantity;
    expect(Number(afterQty)).toBe(Number(beforeQty) - 2);
  });

  it("Gift: product not in gift_pool → 400 NOT_IN_GIFT_POOL", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productAccessoryId, quantity: 1, unitPrice: 0, isGift: true }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_IN_GIFT_POOL");
  });

  it("Gift: quantity exceeds gift_pool → 400 GIFT_POOL_INSUFFICIENT", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productGiftId, quantity: 999, unitPrice: 0, isGift: true }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("GIFT_POOL_INSUFFICIENT");
  });

  // ─────────── Commission snapshot (D-17) ───────────

  it("Commission snapshot: seller with user_override gets user values (not category rule)", async () => {
    const r = await freshWithSession({ id: sellerId, username: "sel1", role: "seller", name: "S" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-Z-001" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      order: { items: Array<{ commissionRuleSnapshot: Record<string, unknown> }> };
    };
    const snap = body.order.items[0].commissionRuleSnapshot;
    expect(snap.source).toBe("user_override");
    expect(snap.seller_fixed_per_unit).toBe(50); // user override
  });

  it("Commission snapshot: admin (no user override) on VIN category gets category rule", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-CAT-001" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      order: { items: Array<{ commissionRuleSnapshot: Record<string, unknown> }> };
    };
    const snap = body.order.items[0].commissionRuleSnapshot;
    expect(snap.source).toBe("category_rule");
    expect(snap.seller_fixed_per_unit).toBe(25);
    expect(snap.driver_fixed_per_delivery).toBe(15);
  });

  it("Commission snapshot: admin on category without rule falls back to settings defaults", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
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
      order: { items: Array<{ commissionRuleSnapshot: Record<string, unknown> }> };
    };
    const snap = body.order.items[0].commissionRuleSnapshot;
    expect(snap.source).toBe("default");
    expect(snap.seller_fixed_per_unit).toBe(10); // settings default
    expect(snap.driver_fixed_per_delivery).toBe(8);
  });

  // ─────────── mark-ready transition ───────────

  it("mark-ready on status='محجوز' → 409 INVALID_STATE_TRANSITION (must start prep first)", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const createRes = await r.orders.POST(
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
    const { order } = (await createRes.json()) as { order: { id: number } };

    const markRes = await r.mark.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `mark-too-early-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(markRes.status).toBe(409);
    const body = (await markRes.json()) as { code: string };
    expect(body.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("Full state machine: محجوز → قيد التحضير → جاهز", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const createRes = await r.orders.POST(
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
    const { order } = (await createRes.json()) as { order: { id: number; status: string } };
    expect(order.status).toBe("محجوز");

    const r2 = await freshWithSession({
      id: stockKeeperId,
      username: "sk1",
      role: "stock_keeper",
      name: "SK",
    });
    const startRes = await r2.start.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `start-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(startRes.status).toBe(200);
    const startBody = (await startRes.json()) as { order: { status: string } };
    expect(startBody.order.status).toBe("قيد التحضير");

    const r3 = await freshWithSession({
      id: stockKeeperId,
      username: "sk1",
      role: "stock_keeper",
      name: "SK",
    });
    const markRes = await r3.mark.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `mark-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(markRes.status).toBe(200);
    const markBody = (await markRes.json()) as { order: { status: string } };
    expect(markBody.order.status).toBe("جاهز");
  });

  it("mark-ready requires Idempotency-Key (400)", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.mark.POST(
      new Request("http://localhost/api/v1/orders/1/mark-ready", { method: "POST" }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  // ─────────── Preparation queue ───────────

  it("GET /api/v1/preparation returns only محجوز + قيد التحضير orders", async () => {
    const r = await freshWithSession({
      id: stockKeeperId,
      username: "sk1",
      role: "stock_keeper",
      name: "SK",
    });
    const res = await r.preparation.GET(new Request("http://localhost/api/v1/preparation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: Array<{ status: string }>; total: number };
    expect(body.total).toBeGreaterThan(0);
    for (const o of body.orders) {
      expect(["محجوز", "قيد التحضير"]).toContain(o.status);
    }
  });

  it("GET /api/v1/preparation: seller 403 (not in prep role set)", async () => {
    const r = await freshWithSession({
      id: sellerId,
      username: "sel1",
      role: "seller",
      name: "S",
    });
    const res = await r.preparation.GET(new Request("http://localhost/api/v1/preparation"));
    expect(res.status).toBe(403);
  });

  it("GET /api/v1/preparation: driver 403", async () => {
    const r = await freshWithSession({ id: 999, username: "drv", role: "driver", name: "D" });
    const res = await r.preparation.GET(new Request("http://localhost/api/v1/preparation"));
    expect(res.status).toBe(403);
  });

  // ─────────── Stock decrement side-effect ───────────

  it("createOrder decrements products.stock by qty (BR-38 'مثل أي صنف')", async () => {
    const { withRead } = await import("@/db/client");
    const { products } = await import("@/db/schema");
    const beforeStock = Number(
      (
        await withRead(undefined, (db) =>
          db.select().from(products).where(eq(products.id, productAccessoryId)).limit(1),
        )
      )[0].stock,
    );

    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productAccessoryId, quantity: 3, unitPrice: 100 }],
        }),
      }),
    );
    expect(res.status).toBe(201);

    const afterStock = Number(
      (
        await withRead(undefined, (db) =>
          db.select().from(products).where(eq(products.id, productAccessoryId)).limit(1),
        )
      )[0].stock,
    );
    expect(afterStock).toBe(beforeStock - 3);
  });

  it("createOrder with insufficient stock → 400 STOCK_INSUFFICIENT", async () => {
    const r = await freshWithSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productAccessoryId, quantity: 99999, unitPrice: 100 }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("STOCK_INSUFFICIENT");
  });
});
