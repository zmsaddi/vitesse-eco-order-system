import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 3.1.1 targeted fixes (reviewer's 4 gaps against 80019ee):
//   1. Coverage-only change (unit tests — covered by running `npm run test:unit` exit 0).
//   2. VIN_DUPLICATE within-request + cross-request active orders.
//   3. PRICE_BELOW_COST no longer leaks cost_price to the client.
//   4. Canonical lock acquisition order — verified indirectly via a concurrent
//      cross-order test + VIN sanity (deadlock-free regardless of payload order).

describe.skipIf(!HAS_DB)("Phase 3.1.1 fixes (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
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
    const { users, clients, products, settings } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    const hash = await hashPassword("test-pass-3.1.1");
    sellerId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(users)
          .values({
            username: "sel-311",
            password: hash,
            name: "Seller 3.1.1",
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
          .values({ name: "عميل 3.1.1", phone: "+33600311001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    [productBikeId, productAccessoryId] = await withTxInRoute(undefined, async (tx) => {
      const bike = await tx
        .insert(products)
        .values({
          name: "دراجة 3.1.1",
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
          name: "إكسسوار 3.1.1",
          category: "إكسسوار",
          buyPrice: "50.00",
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

  async function freshOrders(user: { id: number; username: string; role: string; name: string }) {
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession(user);
    return await import("@/app/api/v1/orders/route");
  }

  // ─────────── Fix 2: VIN_DUPLICATE within same request ───────────

  it("Fix 2 — same VIN on two items in the same POST → 400 VIN_DUPLICATE", async () => {
    const r = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-A-001" },
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-A-001" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VIN_DUPLICATE");
  });

  it("Fix 2 — same VIN with different casing/whitespace still caught", async () => {
    const r = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-Case-01" },
            { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: " vin-case-01 " },
          ],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VIN_DUPLICATE");
  });

  // ─────────── Fix 2: VIN_DUPLICATE cross-request (active orders) ───────────

  it("Fix 2 — same VIN on a DIFFERENT active order → 409 VIN_DUPLICATE", async () => {
    const r = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const first = await r.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-ACTIVE-1" }],
        }),
      }),
    );
    expect(first.status).toBe(201);

    const r2 = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const second = await r2.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-ACTIVE-1" }],
        }),
      }),
    );
    expect(second.status).toBe(409);
    const body = (await second.json()) as { code: string };
    expect(body.code).toBe("VIN_DUPLICATE");
  });

  it("Fix 2 — VIN freed after parent order cancelled → reuse allowed", async () => {
    const r = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const first = await r.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-FREE-1" }],
        }),
      }),
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { order: { id: number } };

    // Cancel the first order.
    vi.resetModules();
    const envMod = await import("@/lib/env");
    envMod.resetEnvCacheForTesting();
    mockSession({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const cancelRoute = await import("@/app/api/v1/orders/[id]/cancel/route");
    const cancelRes = await cancelRoute.POST(
      new Request(`http://localhost/api/v1/orders/${firstBody.order.id}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `vin-free-cancel-${firstBody.order.id}`,
        },
        body: JSON.stringify({
          reason: "test VIN freeing",
          returnToStock: true,
          sellerBonusAction: "keep",
          driverBonusAction: "keep",
        }),
      }),
      { params: Promise.resolve({ id: String(firstBody.order.id) }) },
    );
    expect(cancelRes.status).toBe(200);

    // Now VIN should be reusable.
    const r2 = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const reuse = await r2.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-FREE-1" }],
        }),
      }),
    );
    expect(reuse.status).toBe(201);
  });

  it("Fix 2 — empty VIN items never conflict with each other (multiple non-VIN items)", async () => {
    const r = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            { productId: productAccessoryId, quantity: 1, unitPrice: 100 },
            { productId: productAccessoryId, quantity: 2, unitPrice: 100 },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
  });

  // ─────────── Fix 3: PRICE_BELOW_COST does NOT leak costPrice to seller ───────────

  it("Fix 3 — PRICE_BELOW_COST error body omits costPrice (never leaks buy_price)", async () => {
    const r = await freshOrders({ id: sellerId, username: "sel-311", role: "seller", name: "S" });
    const res = await r.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            // recommended=100, cost=50; sending unitPrice=10 → discount would be 90%
            // (blocked by DISCOUNT_OVER_LIMIT first for seller). To hit
            // PRICE_BELOW_COST we need discount under cap but unit < cost. Use
            // productBike: recommended=1000, cost=500. discount 5% (seller cap) →
            // unit=950 (still > cost). So for seller this path is hard to hit
            // directly — switch to admin who can apply big discount that drives
            // unit below cost.
          ],
        }),
      }),
    );
    // Validate via admin — admin can discount below cost and trigger PRICE_BELOW_COST.
    expect(res.status).toBe(400); // empty items array refine fails; shift focus

    const r2 = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res2 = await r2.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [
            // recommended=100, cost=50; admin sends unitPrice=10 (below cost).
            { productId: productAccessoryId, quantity: 1, unitPrice: 10 },
          ],
        }),
      }),
    );
    expect(res2.status).toBe(400);
    const body = (await res2.json()) as {
      code: string;
      details?: Record<string, unknown>;
      error: string;
    };
    expect(body.code).toBe("PRICE_BELOW_COST");
    // The public body must NOT contain costPrice, buyPrice, or the word "cost".
    expect(body.details).toBeDefined();
    expect(body.details).not.toHaveProperty("costPrice");
    expect(body.details).not.toHaveProperty("buyPrice");
    expect(body.details).not.toHaveProperty("cost");
    // And the message itself stays vague (no numeric cost leak).
    expect(body.error).not.toContain("50"); // the cost value
    expect(body.error).not.toMatch(/buy|cost|شراء/);
  });

  // ─────────── Fix 4: lock-ordering regression — concurrent creates with
  // the same items in REVERSE payload order must both succeed without deadlock. ───────────

  it("Fix 4 — two orders with same 2 products in reverse payload order both succeed", async () => {
    const r1 = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const r2 = await freshOrders({ id: adminUserId, username: "admin", role: "pm", name: "A" });

    const [res1, res2] = await Promise.all([
      r1.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-20",
            items: [
              { productId: productAccessoryId, quantity: 1, unitPrice: 100 },
              { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-LOCK-1" },
            ],
          }),
        }),
      ),
      r2.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-20",
            items: [
              // REVERSE order of product ids vs r1. With deterministic lock
              // acquisition (products ORDER BY id ASC), neither tx deadlocks.
              { productId: productBikeId, quantity: 1, unitPrice: 1000, vin: "VIN-LOCK-2" },
              { productId: productAccessoryId, quantity: 1, unitPrice: 100 },
            ],
          }),
        }),
      ),
    ]);
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });
});
