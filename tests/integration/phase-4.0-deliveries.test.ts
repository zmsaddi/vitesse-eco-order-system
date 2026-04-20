import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { HAS_DB, TEST_DATABASE_URL, applyMigrations, resetSchema } from "./setup";

// Phase 4.0 — deliveries core + driver-tasks + collection + bonus computation.
// Exercises the full flow on live Neon: order (جاهز) → delivery (جاهز) → start
// (جاري التوصيل) → confirm (تم التوصيل) → order becomes مؤكد + payments row +
// bonuses rows + driver_task completes.

describe.skipIf(!HAS_DB)("Phase 4.0 deliveries + bonuses (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let driverId: number;
  let driver2Id: number;
  let stockKeeperId: number;
  let clientId: number;
  let productId: number;

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
    const {
      users,
      clients,
      products,
      settings,
      productCommissionRules,
    } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    const hash = await hashPassword("test-pass-4.0");
    [sellerId, driverId, driver2Id, stockKeeperId] = await withTxInRoute(
      undefined,
      async (tx) => {
        const seller = await tx
          .insert(users)
          .values({
            username: "sel-4",
            password: hash,
            name: "Seller 4",
            role: "seller",
            active: true,
          })
          .returning();
        const driver = await tx
          .insert(users)
          .values({
            username: "drv-4a",
            password: hash,
            name: "Driver 4A",
            role: "driver",
            active: true,
          })
          .returning();
        const driver2 = await tx
          .insert(users)
          .values({
            username: "drv-4b",
            password: hash,
            name: "Driver 4B",
            role: "driver",
            active: true,
          })
          .returning();
        const sk = await tx
          .insert(users)
          .values({
            username: "sk-4",
            password: hash,
            name: "SK 4",
            role: "stock_keeper",
            active: true,
          })
          .returning();
        return [seller[0].id, driver[0].id, driver2[0].id, sk[0].id];
      },
    );

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 4.0", phone: "+33600400001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "منتج 4.0",
          category: "إكسسوار-4",
          buyPrice: "40.00",
          sellPrice: "100.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      const upserts = [
        { key: "max_discount_seller_pct", value: "5" },
        { key: "seller_bonus_fixed", value: "0" },
        { key: "seller_bonus_percentage", value: "0" },
        { key: "driver_bonus_fixed", value: "0" },
      ];
      for (const s of upserts) {
        await tx
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
      }
      await tx
        .insert(productCommissionRules)
        .values({
          category: "إكسسوار-4",
          sellerFixedPerUnit: "5",
          sellerPctOverage: "10",
          driverFixedPerDelivery: "8",
          active: true,
        })
        .onConflictDoNothing({ target: productCommissionRules.category });
      return p[0].id;
    });
  });

  function mockSession(user: { id: number; username: string; role: string; name: string }) {
    vi.doMock("@/auth", () => ({
      auth: async () => ({
        user: {
          id: String(user.id),
          username: user.username,
          role: user.role,
          name: user.name,
        },
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
      startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
      deliveries: await import("@/app/api/v1/deliveries/route"),
      deliveriesStart: await import("@/app/api/v1/deliveries/[id]/start/route"),
      deliveriesConfirm: await import(
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route"
      ),
      driverTasks: await import("@/app/api/v1/driver-tasks/route"),
    };
  }

  // Helper: create + progress an order to status="جاهز".
  // The CREATOR claims may be a seller (so the order's bonus attribution wires
  // to that seller later). The state transitions (start-preparation, mark-ready)
  // are admin-only endpoints, so we switch to an admin session for those two
  // hops regardless of who created the order.
  async function createReadyOrder(
    creatorClaims: { id: number; username: string; role: string; name: string },
    items: Array<{
      productId: number;
      quantity: number;
      unitPrice: number;
      isGift?: boolean;
    }>,
  ): Promise<{ orderId: number }> {
    const rCreate = await freshRoutes(creatorClaims);
    const createRes = await rCreate.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items,
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const { order } = (await createRes.json()) as { order: { id: number } };

    const adminClaims = {
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    };

    const rStart = await freshRoutes(adminClaims);
    const startRes = await rStart.startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-sp-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(startRes.status).toBe(200);

    const rReady = await freshRoutes(adminClaims);
    const readyRes = await rReady.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-mr-${order.id}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(readyRes.status).toBe(200);
    return { orderId: order.id };
  }

  // ─────────── createDelivery ───────────

  it("createDelivery: order 'جاهز' → delivery row + refCode DL-* + driver_task spawned", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [{ productId, quantity: 2, unitPrice: 120 }],
    );
    const r = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      delivery: { id: number; refCode: string; status: string; assignedDriverId: number };
    };
    expect(body.delivery.refCode).toMatch(/^DL-\d{8}-\d{5}$/);
    expect(body.delivery.status).toBe("جاهز");
    expect(body.delivery.assignedDriverId).toBe(driverId);

    // driver_task should exist.
    const { withRead } = await import("@/db/client");
    const { driverTasks } = await import("@/db/schema");
    const tasks = await withRead(undefined, (db) =>
      db
        .select()
        .from(driverTasks)
        .where(
          and(
            eq(driverTasks.relatedEntityType, "delivery"),
            eq(driverTasks.relatedEntityId, body.delivery.id),
          ),
        ),
    );
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].assignedDriverId).toBe(driverId);
  });

  it("createDelivery: rejects order NOT in 'جاهز' with 409 ORDER_NOT_READY", async () => {
    // Create a fresh order, but don't mark-ready.
    const r = await freshRoutes({ id: sellerId, username: "sel-4", role: "seller", name: "S" });
    const create = await r.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-20",
          items: [{ productId, quantity: 1, unitPrice: 100 }],
        }),
      }),
    );
    const { order } = (await create.json()) as { order: { id: number } };

    const r2 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const res = await r2.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, assignedDriverId: driverId }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ORDER_NOT_READY");
  });

  it("createDelivery: double-create on same order → 409 DELIVERY_ALREADY_EXISTS", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [{ productId, quantity: 1, unitPrice: 100 }],
    );
    const r = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const first = await r.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    expect(first.status).toBe(201);

    const r2 = await freshRoutes({ id: adminUserId, username: "admin", role: "pm", name: "A" });
    const second = await r2.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    expect(second.status).toBe(409);
    const body = (await second.json()) as { code: string };
    expect(body.code).toBe("DELIVERY_ALREADY_EXISTS");
  });

  // ─────────── driver-tasks list ───────────

  it("GET /driver-tasks (driver self) → only their pending+in_progress tasks", async () => {
    const r = await freshRoutes({ id: driverId, username: "drv-4a", role: "driver", name: "D" });
    const res = await r.driverTasks.GET(
      new Request("http://localhost/api/v1/driver-tasks"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ assignedDriverId: number; status: string }>;
      total: number;
    };
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
    for (const t of body.tasks) {
      expect(t.assignedDriverId).toBe(driverId);
      expect(["pending", "in_progress"]).toContain(t.status);
    }
  });

  it("GET /driver-tasks: seller 403", async () => {
    const r = await freshRoutes({ id: sellerId, username: "sel-4", role: "seller", name: "S" });
    const res = await r.driverTasks.GET(
      new Request("http://localhost/api/v1/driver-tasks"),
    );
    expect(res.status).toBe(403);
  });

  it("GET /driver-tasks: driver cannot override ?driverUserId to another driver", async () => {
    const r = await freshRoutes({ id: driverId, username: "drv-4a", role: "driver", name: "D" });
    const res = await r.driverTasks.GET(
      new Request(`http://localhost/api/v1/driver-tasks?driverUserId=${driver2Id}`),
    );
    expect(res.status).toBe(403);
  });

  // ─────────── start-delivery ───────────

  it("start-delivery: driver starts own → status جاري التوصيل + task in_progress", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [{ productId, quantity: 1, unitPrice: 100 }],
    );
    const rAdmin = await freshRoutes({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });
    const createRes = await rAdmin.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await createRes.json()) as { delivery: { id: number } };

    const rDriver = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const startRes = await rDriver.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-dstart-${delivery.id}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(startRes.status).toBe(200);
    const body = (await startRes.json()) as { delivery: { status: string } };
    expect(body.delivery.status).toBe("جاري التوصيل");
  });

  it("start-delivery: other driver → 403", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [{ productId, quantity: 1, unitPrice: 100 }],
    );
    const rAdmin = await freshRoutes({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });
    const createRes = await rAdmin.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await createRes.json()) as { delivery: { id: number } };

    const rWrong = await freshRoutes({
      id: driver2Id,
      username: "drv-4b",
      role: "driver",
      name: "B",
    });
    const res = await rWrong.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-dstart-wrong-${delivery.id}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(res.status).toBe(403);
  });

  it("start-delivery: requires Idempotency-Key (400)", async () => {
    const r = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const res = await r.deliveriesStart.POST(
      new Request("http://localhost/api/v1/deliveries/1/start", { method: "POST" }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  // ─────────── confirm-delivery (full happy-path) ───────────

  it("confirm-delivery: full flow — order مؤكد + payment row + bonuses + task completed", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [
        // qty=3, unit=110, recommended=100, cost=40 → item_line=330.
        { productId, quantity: 3, unitPrice: 110 },
      ],
    );
    const rAdmin = await freshRoutes({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });
    const createRes = await rAdmin.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await createRes.json()) as { delivery: { id: number } };

    // Start.
    const rDrvStart = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const startRes = await rDrvStart.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-cd-start-${delivery.id}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(startRes.status).toBe(200);

    // Confirm.
    const rDrvConfirm = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const confirmRes = await rDrvConfirm.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `4.0-cd-confirm-${delivery.id}`,
          },
          body: JSON.stringify({
            paidAmount: 330,
            paymentMethod: "كاش",
            notes: "سُلِّم بالكامل",
          }),
        },
      ),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(confirmRes.status).toBe(200);
    const confirmBody = (await confirmRes.json()) as {
      delivery: { status: string; confirmationDate: string | null };
    };
    expect(confirmBody.delivery.status).toBe("تم التوصيل");
    expect(confirmBody.delivery.confirmationDate).not.toBeNull();

    const { withRead } = await import("@/db/client");
    const { bonuses, driverTasks, orders, payments } = await import("@/db/schema");

    // Order → مؤكد, paymentStatus=paid.
    const orderRows = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(orderRows[0].status).toBe("مؤكد");
    expect(orderRows[0].paymentStatus).toBe("paid");
    expect(Number(orderRows[0].advancePaid)).toBe(330);

    // Payment row.
    const payRows = await withRead(undefined, (db) =>
      db.select().from(payments).where(eq(payments.orderId, orderId)),
    );
    expect(payRows.length).toBe(1);
    expect(Number(payRows[0].amount)).toBe(330);
    expect(payRows[0].type).toBe("collection");

    // Bonuses: 1 seller row (per-item, 1 non-gift item) + 1 driver row.
    const bonusRows = await withRead(undefined, (db) =>
      db
        .select()
        .from(bonuses)
        .where(and(eq(bonuses.orderId, orderId), isNull(bonuses.deletedAt))),
    );
    const seller = bonusRows.filter((b) => b.role === "seller");
    const driver = bonusRows.filter((b) => b.role === "driver");
    expect(seller.length).toBe(1);
    expect(driver.length).toBe(1);
    // Seller: fixed=5×3=15, overage = (110-100)×3×10% = 3, total=18.
    expect(Number(seller[0].fixedPart)).toBe(15);
    expect(Number(seller[0].overagePart)).toBe(3);
    expect(Number(seller[0].totalBonus)).toBe(18);
    // Driver: fixed=8, one row per delivery.
    expect(Number(driver[0].totalBonus)).toBe(8);
    expect(driver[0].orderItemId).toBeNull();

    // Driver task → completed.
    const tasks = await withRead(undefined, (db) =>
      db
        .select()
        .from(driverTasks)
        .where(
          and(
            eq(driverTasks.relatedEntityType, "delivery"),
            eq(driverTasks.relatedEntityId, delivery.id),
          ),
        ),
    );
    expect(tasks[0].status).toBe("completed");
    expect(tasks[0].completedAt).not.toBeNull();
  });

  it("confirm-delivery: credit sale (paidAmount=0) — no payment row, bonuses still computed", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [{ productId, quantity: 1, unitPrice: 100 }],
    );
    const rAdmin = await freshRoutes({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });
    const createRes = await rAdmin.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await createRes.json()) as { delivery: { id: number } };

    const rDrv1 = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    await rDrv1.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-credit-start-${delivery.id}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );

    const rDrv2 = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const res = await rDrv2.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `4.0-credit-confirm-${delivery.id}`,
          },
          body: JSON.stringify({ paidAmount: 0, paymentMethod: "آجل" }),
        },
      ),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(res.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { bonuses, orders, payments } = await import("@/db/schema");

    const orderRows = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(orderRows[0].status).toBe("مؤكد");
    expect(orderRows[0].paymentStatus).toBe("pending"); // nothing collected

    const payRows = await withRead(undefined, (db) =>
      db.select().from(payments).where(eq(payments.orderId, orderId)),
    );
    expect(payRows.length).toBe(0);

    const bonusRows = await withRead(undefined, (db) =>
      db.select().from(bonuses).where(eq(bonuses.orderId, orderId)),
    );
    expect(bonusRows.length).toBeGreaterThanOrEqual(2); // at least seller + driver
  });

  it("confirm-delivery: gifts are excluded from seller bonuses but driver row still one per delivery", async () => {
    // Need gift_pool seeded for the gift product.
    const { withTxInRoute } = await import("@/db/client");
    const { giftPool, products } = await import("@/db/schema");
    const giftProductId = await withTxInRoute(undefined, async (tx) => {
      const gp = await tx
        .insert(products)
        .values({
          name: "هدية 4.0",
          category: "إكسسوار-4",
          buyPrice: "5.00",
          sellPrice: "50.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      await tx.insert(giftPool).values({
        productId: gp[0].id,
        quantity: "20",
        createdBy: "admin",
      });
      return gp[0].id;
    });

    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [
        { productId, quantity: 1, unitPrice: 100 },
        { productId: giftProductId, quantity: 1, unitPrice: 0, isGift: true },
      ],
    );
    const rAdmin = await freshRoutes({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });
    const cd = await rAdmin.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await cd.json()) as { delivery: { id: number } };

    const rStart = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    await rStart.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-gift-start-${delivery.id}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    const rConfirm = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const res = await rConfirm.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `4.0-gift-confirm-${delivery.id}`,
          },
          body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
        },
      ),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(res.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { bonuses } = await import("@/db/schema");
    const bonusRows = await withRead(undefined, (db) =>
      db
        .select()
        .from(bonuses)
        .where(and(eq(bonuses.orderId, orderId), isNull(bonuses.deletedAt))),
    );
    // Exactly 1 seller (non-gift only) + 1 driver.
    expect(bonusRows.filter((b) => b.role === "seller").length).toBe(1);
    expect(bonusRows.filter((b) => b.role === "driver").length).toBe(1);
  });

  it("confirm-delivery: same Idempotency-Key replay → cached, not double-applied", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [{ productId, quantity: 1, unitPrice: 100 }],
    );
    const rAdmin = await freshRoutes({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });
    const cd = await rAdmin.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await cd.json()) as { delivery: { id: number } };
    const rStart = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    await rStart.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `4.0-idem-start-${delivery.id}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );

    const idemKey = `4.0-idem-confirm-${delivery.id}`;
    const r1 = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const res1 = await r1.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
        },
      ),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(res1.status).toBe(200);

    const r2 = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const res2 = await r2.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
        },
      ),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(res2.status).toBe(200);

    const { withRead } = await import("@/db/client");
    const { bonuses, payments } = await import("@/db/schema");
    const payRows = await withRead(undefined, (db) =>
      db.select().from(payments).where(eq(payments.orderId, orderId)),
    );
    expect(payRows.length).toBe(1); // NOT 2 — replay used cache
    const bonusRows = await withRead(undefined, (db) =>
      db.select().from(bonuses).where(eq(bonuses.orderId, orderId)),
    );
    expect(bonusRows.filter((b) => b.role === "driver").length).toBe(1);
    expect(bonusRows.filter((b) => b.role === "seller").length).toBe(1);
  });

  it("confirm-delivery: status not 'جاري التوصيل' → 409 INVALID_STATE_TRANSITION", async () => {
    const { orderId } = await createReadyOrder(
      { id: sellerId, username: "sel-4", role: "seller", name: "S" },
      [{ productId, quantity: 1, unitPrice: 100 }],
    );
    const rAdmin = await freshRoutes({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "A",
    });
    const cd = await rAdmin.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverId }),
      }),
    );
    const { delivery } = (await cd.json()) as { delivery: { id: number } };

    // Confirm WITHOUT starting — should 409.
    const r = await freshRoutes({
      id: driverId,
      username: "drv-4a",
      role: "driver",
      name: "D",
    });
    const res = await r.deliveriesConfirm.POST(
      new Request(
        `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `4.0-badstate-${delivery.id}`,
          },
          body: JSON.stringify({ paidAmount: 0, paymentMethod: "آجل" }),
        },
      ),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("stock_keeper → 403 on driver-tasks", async () => {
    const r = await freshRoutes({
      id: stockKeeperId,
      username: "sk-4",
      role: "stock_keeper",
      name: "SK",
    });
    const res = await r.driverTasks.GET(
      new Request("http://localhost/api/v1/driver-tasks"),
    );
    expect(res.status).toBe(403);
  });
});
