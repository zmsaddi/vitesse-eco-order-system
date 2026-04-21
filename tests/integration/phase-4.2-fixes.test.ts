import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.2 — treasury core + driver→manager handover + collection bridge.
//
// Coverage matrix (negative-first):
//   T-H1  happy   handover updates both balances + 1 movement + activity_log
//   T-H2  -       handover amount > balance → INSUFFICIENT_CUSTODY, no side effects
//   T-H3  -       idempotency replay → same response, 1 movement
//   T-H4  -       seller / stock_keeper → 403 from route
//   T-H5  -       different driver / different manager → 403 from service
//   T-H6  -       driver without manager_id → CUSTODY_DRIVER_UNLINKED
//   T-H7  -       concurrency: two parallel handovers from same custody → second
//                 fails INSUFFICIENT_CUSTODY (FOR UPDATE serialises)
//   T-V1  -       GET /treasury as pm → all accounts visible
//   T-V2  -       GET /treasury as manager → own box + own-team custodies; NO
//                 other manager's drivers
//   T-V3  -       GET /treasury as driver → own custody only
//   T-V4  -       GET /treasury as seller / stock_keeper → 403
//   T-B1  -       confirm-delivery + paidAmount=100 → driver_custody=100 +
//                 sale_collection movement
//   T-B2  -       driver lacking manager_id cannot confirm with paidAmount > 0
//   T-B3  -       BR-55b on bridge: paidAmount that pushes over cap → rejected,
//                 ZERO side effects (delivery still جاري التوصيل, order still جاهز,
//                 no payment, no bonus, no invoice, no movement, no balance change)
//   T-B4  -       concurrency on bridge: two confirm-delivery in flight on the
//                 same custody, only one fits under cap → other fails CUSTODY_CAP_EXCEEDED
//   T-A1  -       UPDATE treasury_movements rejected by D-58 trigger
//   T-E2E -       collect 100 → handover 100 → custody=0 + manager_box=100 + 2 movements

function todayParisIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

describe.skipIf(!HAS_DB)("Phase 4.2 — treasury (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let stockKeeperId: number;
  let managerId: number;
  let managerOtherId: number;
  let driverId: number;
  let driverOtherId: number; // belongs to managerOther
  let driverNoMgrId: number;
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

    const hash = await hashPassword("test-pass-4.2");

    // Wire two separate (manager, drivers) chains so we can prove team
    // isolation: manager A sees driver A only, NOT driver B.
    const wiredA = await import("@/db/client").then(({ withTxInRoute: w }) =>
      w(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "a42",
          driverSuffixes: ["a42"],
          passwordHash: hash,
        }),
      ),
    );
    managerId = wiredA.managerId;
    driverId = wiredA.driverIds[0];

    const wiredB = await withTxInRoute(undefined, (tx) =>
      wireManagerAndDrivers(tx, {
        managerSuffix: "b42",
        driverSuffixes: ["b42"],
        passwordHash: hash,
      }),
    );
    managerOtherId = wiredB.managerId;
    driverOtherId = wiredB.driverIds[0];

    [sellerId, stockKeeperId, driverNoMgrId] = await withTxInRoute(undefined, async (tx) => {
      const seller = await tx
        .insert(users)
        .values({ username: "sel-42x", password: hash, name: "Seller 42", role: "seller", active: true })
        .returning();
      const sk = await tx
        .insert(users)
        .values({ username: "sk-42", password: hash, name: "SK 42", role: "stock_keeper", active: true })
        .returning();
      // Driver intentionally without managerId — simulates legacy data the
      // backfill could not auto-resolve. Inserted directly to bypass the
      // service-level DRIVER_MANAGER_REQUIRED check.
      const drvNoMgr = await tx
        .insert(users)
        .values({
          username: "drv-nomgr-42",
          password: hash,
          name: "Driver Orphan",
          role: "driver",
          active: true,
        })
        .returning();
      return [seller[0].id, sk[0].id, drvNoMgr[0].id];
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 4.2", phone: "+33600420001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "منتج 4.2",
          category: "cat-42x",
          buyPrice: "40.00",
          sellPrice: "100.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      const ops = [
        { key: "max_discount_seller_pct", value: "5" },
        { key: "seller_bonus_fixed", value: "0" },
        { key: "seller_bonus_percentage", value: "0" },
        { key: "driver_bonus_fixed", value: "0" },
        { key: "driver_custody_cap_eur", value: "300" }, // tight cap for T-B3 + T-B4
        ...D35_SEED_SETTINGS,
      ];
      for (const s of ops) {
        await tx
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
      }
      await tx
        .insert(productCommissionRules)
        .values({
          category: "cat-42x",
          sellerFixedPerUnit: "5",
          sellerPctOverage: "10",
          driverFixedPerDelivery: "8",
          active: true,
        })
        .onConflictDoNothing({ target: productCommissionRules.category });
      return p[0].id;
    });

    // Pre-fund driverId's custody so handover tests have stock to spend.
    await withTxInRoute(undefined, async (tx) => {
      const { treasuryAccounts } = await import("@/db/schema");
      await tx
        .update(treasuryAccounts)
        .set({ balance: "200.00" })
        .where(
          eq(treasuryAccounts.ownerUserId, driverId),
        );
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
      treasury: await import("@/app/api/v1/treasury/route"),
      handover: await import("@/app/api/v1/treasury/handover/route"),
      orders: await import("@/app/api/v1/orders/route"),
      startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
      markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
      deliveries: await import("@/app/api/v1/deliveries/route"),
      deliveriesStart: await import("@/app/api/v1/deliveries/[id]/start/route"),
      deliveriesConfirm: await import(
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route"
      ),
    };
  }

  const admin = () => ({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
  const seller = () => ({ id: sellerId, username: "sel-42x", role: "seller", name: "Seller" });
  const sk = () => ({ id: stockKeeperId, username: "sk-42", role: "stock_keeper", name: "SK" });
  const manager = () => ({ id: managerId, username: "mgr-a42", role: "manager", name: "Manager A" });
  const managerOther = () => ({
    id: managerOtherId,
    username: "mgr-b42",
    role: "manager",
    name: "Manager B",
  });
  const driver = () => ({ id: driverId, username: "drv-a42", role: "driver", name: "Driver A" });
  const driverNoMgr = () => ({
    id: driverNoMgrId,
    username: "drv-nomgr-42",
    role: "driver",
    name: "Driver Orphan",
  });

  async function callHandover(
    claims: { id: number; username: string; role: string; name: string },
    body: { amount: number; driverUserId?: number },
    idem: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.handover.POST(
      new Request("http://localhost/api/v1/treasury/handover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `42-handover-${idem}`,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async function readBalance(ownerId: number): Promise<string> {
    const { withRead } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db
        .select({ balance: treasuryAccounts.balance })
        .from(treasuryAccounts)
        .where(eq(treasuryAccounts.ownerUserId, ownerId)),
    );
    return rows[0]?.balance ?? "0.00";
  }

  // ─────────────────── Handover ───────────────────

  it("T-H1 happy: driver handover → custody-=, manager_box+=, 1 movement, activity_log entry", async () => {
    const before = Number(await readBalance(driverId));
    const res = await callHandover(driver(), { amount: 50 }, "h1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      movementId: number;
      custodyBalance: string;
      managerBoxBalance: string;
    };
    expect(typeof body.movementId).toBe("number");
    expect(Number(body.custodyBalance)).toBeCloseTo(before - 50, 2);
    const mgrBoxAfter = Number(body.managerBoxBalance);
    expect(mgrBoxAfter).toBeGreaterThanOrEqual(50);

    const { withRead } = await import("@/db/client");
    const { treasuryMovements, activityLog } = await import("@/db/schema");
    const movs = await withRead(undefined, (db) =>
      db.select().from(treasuryMovements).where(eq(treasuryMovements.id, body.movementId)),
    );
    expect(movs[0].category).toBe("driver_handover");
    expect(Number(movs[0].amount)).toBe(50);
    expect(movs[0].fromAccountId).not.toBeNull();
    expect(movs[0].toAccountId).not.toBeNull();

    const acts = await withRead(undefined, (db) =>
      db
        .select()
        .from(activityLog)
        .where(eq(activityLog.entityId, body.movementId)),
    );
    expect(acts.length).toBeGreaterThan(0);
  });

  it("T-H2 negative: amount > custody → 409 INSUFFICIENT_CUSTODY + no side effects", async () => {
    const beforeCustody = await readBalance(driverId);
    const beforeBox = await readBalance(managerId);
    const res = await callHandover(driver(), { amount: 999_999 }, "h2");
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INSUFFICIENT_CUSTODY");
    expect(await readBalance(driverId)).toBe(beforeCustody);
    expect(await readBalance(managerId)).toBe(beforeBox);
  });

  it("T-H3 idempotency: same Idempotency-Key replay → same response, 1 movement", async () => {
    const r1 = await callHandover(driver(), { amount: 10 }, "h3");
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { movementId: number };
    const r2 = await callHandover(driver(), { amount: 10 }, "h3");
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { movementId: number };
    expect(b2.movementId).toBe(b1.movementId);

    const { withRead } = await import("@/db/client");
    const { treasuryMovements } = await import("@/db/schema");
    const all = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryMovements)
        .where(eq(treasuryMovements.id, b1.movementId)),
    );
    expect(all.length).toBe(1);
  });

  it("T-H4 unauthorized: seller / stock_keeper → 403 at route", async () => {
    const r1 = await callHandover(seller(), { amount: 10 }, "h4-seller");
    expect(r1.status).toBe(403);
    const r2 = await callHandover(sk(), { amount: 10 }, "h4-sk");
    expect(r2.status).toBe(403);
  });

  it("T-H5 cross-team: manager B handover for driver A (managerId mismatch) → 403", async () => {
    const r = await callHandover(
      managerOther(),
      { amount: 5, driverUserId: driverId },
      "h5",
    );
    expect(r.status).toBe(403);
  });

  it("T-H6 unlinked: driver without manager_id → CUSTODY_DRIVER_UNLINKED", async () => {
    const r = await callHandover(driverNoMgr(), { amount: 1 }, "h6");
    expect(r.status).toBe(409);
    const body = (await r.json()) as { code: string };
    expect(body.code).toBe("CUSTODY_DRIVER_UNLINKED");
  });

  it("T-H7 concurrency: two parallel handovers totalling > balance → only one succeeds", async () => {
    // Reset balance to a known value so we can plan amounts that overlap
    // exactly on the cap.
    const { withTxInRoute } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(treasuryAccounts)
        .set({ balance: "100.00" })
        .where(
          eq(treasuryAccounts.ownerUserId, driverId),
        );
    });

    const [r1, r2] = await Promise.all([
      callHandover(driver(), { amount: 70 }, "h7-a"),
      callHandover(driver(), { amount: 70 }, "h7-b"),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const failBody = (r1.status === 409 ? await r1.json() : await r2.json()) as {
      code: string;
    };
    expect(failBody.code).toBe("INSUFFICIENT_CUSTODY");
    expect(Number(await readBalance(driverId))).toBeCloseTo(30, 2);
  });

  // ─────────────────── Visibility ───────────────────

  it("T-V1 admin (pm) sees all accounts on GET /treasury", async () => {
    const r = await freshRoutes(admin());
    const res = await r.treasury.GET(new Request("http://localhost/api/v1/treasury"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accounts: Array<{ type: string }> };
    const types = body.accounts.map((a) => a.type);
    expect(types).toContain("main_cash");
    expect(types).toContain("main_bank");
    expect(types).toContain("manager_box");
    expect(types).toContain("driver_custody");
  });

  it("T-V2 manager sees own box + own-team custodies (no other team)", async () => {
    const r = await freshRoutes(manager());
    const res = await r.treasury.GET(new Request("http://localhost/api/v1/treasury"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accounts: Array<{ ownerUserId: number; type: string }>;
    };
    const owners = new Set(body.accounts.map((a) => a.ownerUserId));
    expect(owners.has(managerId)).toBe(true);
    expect(owners.has(driverId)).toBe(true);
    // driver of the OTHER manager must not be visible.
    expect(owners.has(driverOtherId)).toBe(false);
    expect(owners.has(managerOtherId)).toBe(false);
    expect(owners.has(adminUserId)).toBe(false);
  });

  it("T-V3 driver sees only own custody", async () => {
    const r = await freshRoutes(driver());
    const res = await r.treasury.GET(new Request("http://localhost/api/v1/treasury"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accounts: Array<{ ownerUserId: number; type: string }>;
    };
    expect(body.accounts.length).toBe(1);
    expect(body.accounts[0].ownerUserId).toBe(driverId);
    expect(body.accounts[0].type).toBe("driver_custody");
  });

  it("T-V4 seller / stock_keeper → 403 on GET /treasury", async () => {
    const r1 = await freshRoutes(seller());
    expect((await r1.treasury.GET(new Request("http://localhost/api/v1/treasury"))).status).toBe(403);
    const r2 = await freshRoutes(sk());
    expect((await r2.treasury.GET(new Request("http://localhost/api/v1/treasury"))).status).toBe(403);
  });

  // ─────────────────── Bridge ───────────────────

  async function progressToReadyAndStart(
    creatorClaims: { id: number; username: string; role: string; name: string },
    driverClaims: { id: number; username: string; role: string; name: string },
    items: Array<{ productId: number; quantity: number; unitPrice: number }>,
    idemTag: string,
  ): Promise<{ orderId: number; deliveryId: number }> {
    const rc = await freshRoutes(creatorClaims);
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, date: "2026-04-21", items }),
      }),
    );
    if (create.status !== 201) {
      const errBody = await create.json().catch(() => ({}));
      throw new Error(
        `progressToReadyAndStart: order POST returned ${create.status} body=${JSON.stringify(errBody)}`,
      );
    }
    const { order } = (await create.json()) as { order: { id: number } };

    const rsp = await freshRoutes(admin());
    await rsp.startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `42-sp-${order.id}-${idemTag}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    const rmr = await freshRoutes(admin());
    await rmr.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `42-mr-${order.id}-${idemTag}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    const rcd = await freshRoutes(admin());
    const cd = await rcd.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, assignedDriverId: driverClaims.id }),
      }),
    );
    expect(cd.status).toBe(201);
    const { delivery } = (await cd.json()) as { delivery: { id: number } };

    const rs = await freshRoutes(driverClaims);
    const start = await rs.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `42-dstart-${delivery.id}-${idemTag}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(start.status).toBe(200);
    return { orderId: order.id, deliveryId: delivery.id };
  }

  async function callConfirm(
    deliveryId: number,
    claims: { id: number; username: string; role: string; name: string },
    body: { paidAmount: number; paymentMethod?: string },
    idem: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.deliveriesConfirm.POST(
      new Request(`http://localhost/api/v1/deliveries/${deliveryId}/confirm-delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `42-cfm-${deliveryId}-${idem}`,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(deliveryId) }) },
    );
  }

  it("T-B1 bridge happy: confirm-delivery paidAmount=100 → custody += 100 + sale_collection movement", async () => {
    // Reset custody to 0 to make the assertion exact.
    const { withTxInRoute } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(treasuryAccounts)
        .set({ balance: "0.00" })
        .where(eq(treasuryAccounts.ownerUserId, driverId));
    });

    const { deliveryId, orderId } = await progressToReadyAndStart(
      seller(),
      driver(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      "b1",
    );
    const res = await callConfirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "b1",
    );
    expect(res.status).toBe(200);
    expect(Number(await readBalance(driverId))).toBeCloseTo(100, 2);

    const { withRead } = await import("@/db/client");
    const { treasuryMovements } = await import("@/db/schema");
    const movs = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryMovements)
        .where(eq(treasuryMovements.referenceId, orderId)),
    );
    const sale = movs.find((m) => m.category === "sale_collection");
    expect(sale).toBeDefined();
    expect(sale!.fromAccountId).toBeNull();
    expect(sale!.toAccountId).not.toBeNull();
    expect(Number(sale!.amount)).toBe(100);
    expect(sale!.date).toBe(todayParisIso());
  });

  it("T-B2 unlinked driver: confirm-delivery with paidAmount > 0 → CUSTODY_DRIVER_UNLINKED + zero side effects", async () => {
    const { deliveryId, orderId } = await progressToReadyAndStart(
      seller(),
      driverNoMgr(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      "b2",
    );
    const res = await callConfirm(
      deliveryId,
      driverNoMgr(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "b2",
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CUSTODY_DRIVER_UNLINKED");

    const { withRead } = await import("@/db/client");
    const { deliveries, orders, payments, bonuses, invoices, treasuryMovements } =
      await import("@/db/schema");
    const drv = await withRead(undefined, (db) =>
      db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1),
    );
    expect(drv[0].status).toBe("جاري التوصيل");
    const ord = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(ord[0].status).toBe("جاهز");
    const pays = await withRead(undefined, (db) =>
      db.select().from(payments).where(eq(payments.orderId, orderId)),
    );
    expect(pays.length).toBe(0);
    const bn = await withRead(undefined, (db) =>
      db.select().from(bonuses).where(eq(bonuses.orderId, orderId)),
    );
    expect(bn.length).toBe(0);
    const inv = await withRead(undefined, (db) =>
      db.select().from(invoices).where(eq(invoices.orderId, orderId)),
    );
    expect(inv.length).toBe(0);
    const movs = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryMovements)
        .where(
          and(
            eq(treasuryMovements.referenceType, "order"),
            eq(treasuryMovements.referenceId, orderId),
          ),
        ),
    );
    expect(movs.length).toBe(0);
  });

  it("T-B3 BR-55b: paidAmount that pushes custody over cap → CUSTODY_CAP_EXCEEDED + zero side effects", async () => {
    // cap = 300 (set in beforeAll). Pre-fill custody to 250 so 100 pushes
    // total to 350 > 300.
    const { withTxInRoute } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(treasuryAccounts)
        .set({ balance: "250.00" })
        .where(eq(treasuryAccounts.ownerUserId, driverId));
    });

    const { deliveryId, orderId } = await progressToReadyAndStart(
      seller(),
      driver(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      "b3",
    );
    const res = await callConfirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "b3",
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CUSTODY_CAP_EXCEEDED");

    const { withRead } = await import("@/db/client");
    const { deliveries, orders, payments, bonuses, invoices, treasuryMovements } =
      await import("@/db/schema");
    expect(
      Number(await readBalance(driverId)),
    ).toBeCloseTo(250, 2);
    const drv = await withRead(undefined, (db) =>
      db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1),
    );
    expect(drv[0].status).toBe("جاري التوصيل");
    const ord = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(ord[0].status).toBe("جاهز");
    const pays = await withRead(undefined, (db) =>
      db.select().from(payments).where(eq(payments.orderId, orderId)),
    );
    expect(pays.length).toBe(0);
    const bn = await withRead(undefined, (db) =>
      db.select().from(bonuses).where(eq(bonuses.orderId, orderId)),
    );
    expect(bn.length).toBe(0);
    const inv = await withRead(undefined, (db) =>
      db.select().from(invoices).where(eq(invoices.orderId, orderId)),
    );
    expect(inv.length).toBe(0);
    const movs = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryMovements)
        .where(
          and(
            eq(treasuryMovements.referenceType, "order"),
            eq(treasuryMovements.referenceId, orderId),
          ),
        ),
    );
    expect(movs.length).toBe(0);
  });

  it("T-B4 concurrent bridge under cap: two confirms, only one fits → other fails CUSTODY_CAP_EXCEEDED", async () => {
    // cap = 300; pre-fill custody = 200; two confirms of 99 each (only 1%
    // discount off the 100€ recommended price — safely inside seller's 5%
    // cap). First bridge bumps custody to 299 (under 300); second would
    // bump to 398 > 300 ⇒ reject CUSTODY_CAP_EXCEEDED.
    const { withTxInRoute } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(treasuryAccounts)
        .set({ balance: "200.00" })
        .where(eq(treasuryAccounts.ownerUserId, driverId));
    });

    // Stage TWO independent (order, delivery, started) tuples, then confirm
    // both in parallel.
    const a = await progressToReadyAndStart(
      seller(),
      driver(),
      [{ productId, quantity: 1, unitPrice: 99 }],
      "b4-a",
    );
    const b = await progressToReadyAndStart(
      seller(),
      driver(),
      [{ productId, quantity: 1, unitPrice: 99 }],
      "b4-b",
    );

    const [rA, rB] = await Promise.all([
      callConfirm(a.deliveryId, driver(), { paidAmount: 99, paymentMethod: "كاش" }, "b4-a"),
      callConfirm(b.deliveryId, driver(), { paidAmount: 99, paymentMethod: "كاش" }, "b4-b"),
    ]);
    const statuses = [rA.status, rB.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const failed = rA.status === 409 ? await rA.json() : await rB.json();
    expect((failed as { code: string }).code).toBe("CUSTODY_CAP_EXCEEDED");
    expect(
      Number(await readBalance(driverId)),
    ).toBeCloseTo(299, 2);
  });

  // ─────────────────── Append-only proof ───────────────────

  it("T-A1 append-only: UPDATE treasury_movements rejected by reject_mutation trigger", async () => {
    const { withTxInRoute } = await import("@/db/client");
    const { sql } = await import("drizzle-orm");
    let threw = false;
    try {
      await withTxInRoute(undefined, async (tx) => {
        await tx.execute(
          sql.raw(
            `UPDATE treasury_movements SET notes = 'TAMPER' WHERE id = (SELECT id FROM treasury_movements ORDER BY id DESC LIMIT 1)`,
          ),
        );
      });
    } catch (e) {
      threw = true;
      // Drizzle wraps the Postgres error as "Failed query: <sql>" and exposes
      // the underlying cause (reject_mutation's RAISE) on err.cause. Match
      // against both layers so we prove the trigger actually fired — any
      // non-trigger error (syntax, permission, etc.) would NOT contain the
      // "row is immutable" substring anywhere on the error chain.
      const err = e as { message?: string; cause?: unknown };
      const causeMsg = err.cause != null ? String(err.cause) : "";
      const combined = `${err.message ?? ""}\n${causeMsg}`;
      expect(combined).toMatch(/row is immutable.*treasury_movements/i);
    }
    expect(threw).toBe(true);
  });

  // ─────────────────── End-to-end ───────────────────

  it("T-E2E: collect 100 → handover 100 → custody=0, manager_box=+100, 2 movements", async () => {
    // Fresh slate.
    const { withTxInRoute } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    const beforeBox = Number(await readBalance(managerId));
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(treasuryAccounts)
        .set({ balance: "0.00" })
        .where(eq(treasuryAccounts.ownerUserId, driverId));
    });

    // 1. collect 100 via confirm-delivery.
    const { deliveryId, orderId } = await progressToReadyAndStart(
      seller(),
      driver(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      "e2e",
    );
    const cf = await callConfirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "e2e",
    );
    expect(cf.status).toBe(200);
    expect(Number(await readBalance(driverId))).toBeCloseTo(100, 2);

    // 2. handover 100.
    const ho = await callHandover(driver(), { amount: 100 }, "e2e");
    expect(ho.status).toBe(200);
    expect(Number(await readBalance(driverId))).toBeCloseTo(0, 2);
    expect(Number(await readBalance(managerId))).toBeCloseTo(beforeBox + 100, 2);

    const { withRead } = await import("@/db/client");
    const { treasuryMovements } = await import("@/db/schema");
    const movs = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryMovements)
        .where(eq(treasuryMovements.referenceId, orderId)),
    );
    const cats = movs.map((m) => m.category);
    expect(cats).toContain("sale_collection");
    // The handover movement references user (driverId), not the order — separate query.
    const handoverMovs = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryMovements)
        .where(eq(treasuryMovements.category, "driver_handover")),
    );
    expect(handoverMovs.length).toBeGreaterThanOrEqual(1);
  });
});
