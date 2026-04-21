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

// Phase 4.3.2 — money precision closure on the remaining two endpoints:
//   POST /api/v1/treasury/handover
//   POST /api/v1/deliveries/[id]/confirm-delivery
//
// Phase 4.3.1 closed transfer + reconcile. This tranche closes the same
// class of drift on the remaining two money-mutating paths: a sub-cent
// amount (0.004, 0.005) must never spawn a zero-value movement / payment
// row. The refine at the DTO layer rejects it at the wire; the service
// layer keeps a defense-in-depth guard for any caller that bypasses Zod.
//
// Coverage:
//   T-HO-PREC-004    handover amount=0.004 → 400 VALIDATION_FAILED + zero side effects
//   T-HO-PREC-005    handover amount=0.005 → 400 VALIDATION_FAILED + zero side effects
//   T-HO-PREC-HAPPY  handover amount=0.01 → 200 (smallest-legal-unit regression)
//   T-CD-PREC-004    confirm-delivery paidAmount=0.004 → 400 VALIDATION_FAILED + zero side effects
//   T-CD-PREC-005    confirm-delivery paidAmount=0.005 → 400 VALIDATION_FAILED + zero side effects
//   T-CD-PREC-HAPPY  confirm-delivery paidAmount=0.01 → 200 + payment=0.01 + sale_collection=0.01

describe.skipIf(!HAS_DB)(
  "Phase 4.3.2 — money precision on handover + confirm-delivery (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let managerId: number;
    let driverId: number;
    let clientId: number;
    let productId: number;

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.NEXTAUTH_SECRET =
        process.env.NEXTAUTH_SECRET ??
        "test-secret-at-least-32-characters-long!!";
      delete process.env.INIT_BOOTSTRAP_SECRET;
      await resetSchema();
      await applyMigrations();

      vi.resetModules();
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();
      const { POST: initPost } = await import("@/app/api/init/route");
      await initPost(
        new Request("http://localhost/api/init", { method: "POST" }) as never,
      );

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

      const hash = await hashPassword("test-pass-4.3.2");

      const wired = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "432",
          driverSuffixes: ["432"],
          passwordHash: hash,
        }),
      );
      managerId = wired.managerId;
      driverId = wired.driverIds[0];

      sellerId = await withTxInRoute(undefined, async (tx) => {
        const rows = await tx
          .insert(users)
          .values({
            username: "sel-432",
            password: hash,
            name: "Seller 4.3.2",
            role: "seller",
            active: true,
          })
          .returning();
        return rows[0].id;
      });

      clientId = (
        await withTxInRoute(undefined, async (tx) =>
          tx
            .insert(clients)
            .values({
              name: "عميل 4.3.2",
              phone: "+33600432001",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      productId = await withTxInRoute(undefined, async (tx) => {
        const p = await tx
          .insert(products)
          .values({
            name: "منتج 4.3.2",
            category: "cat-432",
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
          // Wide cap — this tranche is about precision, not BR-55b.
          { key: "driver_custody_cap_eur", value: "10000" },
          ...D35_SEED_SETTINGS,
        ];
        for (const s of ops) {
          await tx
            .insert(settings)
            .values(s)
            .onConflictDoUpdate({
              target: settings.key,
              set: { value: s.value },
            });
        }
        await tx
          .insert(productCommissionRules)
          .values({
            category: "cat-432",
            sellerFixedPerUnit: "0",
            sellerPctOverage: "0",
            driverFixedPerDelivery: "0",
            active: true,
          })
          .onConflictDoNothing({ target: productCommissionRules.category });
        return p[0].id;
      });

      // Pre-fund driver custody so handover tests have stock to spend (and
      // so the "no side effect" assertions compare against a well-known
      // non-zero balance).
      await withTxInRoute(undefined, async (tx) => {
        const { treasuryAccounts } = await import("@/db/schema");
        await tx
          .update(treasuryAccounts)
          .set({ balance: "500.00" })
          .where(eq(treasuryAccounts.ownerUserId, driverId));
      });
    });

    function mockSession(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
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

    async function freshRoutes(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }) {
      vi.resetModules();
      const envMod = await import("@/lib/env");
      envMod.resetEnvCacheForTesting();
      mockSession(user);
      return {
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

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const seller = () => ({
      id: sellerId,
      username: "sel-432",
      role: "seller",
      name: "Seller",
    });
    const driver = () => ({
      id: driverId,
      username: "drv-432",
      role: "driver",
      name: "Driver 4.3.2",
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
            "Idempotency-Key": `432-ho-${idem}`,
          },
          body: JSON.stringify(body),
        }),
      );
    }

    async function readDriverCustodyBalance(): Promise<string> {
      const { withRead } = await import("@/db/client");
      const { treasuryAccounts } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select({ balance: treasuryAccounts.balance })
          .from(treasuryAccounts)
          .where(
            and(
              eq(treasuryAccounts.ownerUserId, driverId),
              eq(treasuryAccounts.type, "driver_custody"),
            ),
          )
          .limit(1),
      );
      return rows[0]?.balance ?? "0.00";
    }

    async function readManagerBoxBalance(): Promise<string> {
      const { withRead } = await import("@/db/client");
      const { treasuryAccounts } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select({ balance: treasuryAccounts.balance })
          .from(treasuryAccounts)
          .where(
            and(
              eq(treasuryAccounts.ownerUserId, managerId),
              eq(treasuryAccounts.type, "manager_box"),
            ),
          )
          .limit(1),
      );
      return rows[0]?.balance ?? "0.00";
    }

    async function countHandoverMovementsForDriver(): Promise<number> {
      const { withRead } = await import("@/db/client");
      const { treasuryMovements } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select({ id: treasuryMovements.id })
          .from(treasuryMovements)
          .where(
            and(
              eq(treasuryMovements.category, "driver_handover"),
              eq(treasuryMovements.referenceType, "user"),
              eq(treasuryMovements.referenceId, driverId),
            ),
          ),
      );
      return rows.length;
    }

    async function progressToReadyAndStart(
      creatorClaims: { id: number; username: string; role: string; name: string },
      driverClaims: { id: number; username: string; role: string; name: string },
      items: Array<{ productId: number; quantity: number; unitPrice: number }>,
      paymentMethod: "كاش" | "بنك" | "آجل",
      idemTag: string,
    ): Promise<{ orderId: number; deliveryId: number }> {
      const rc = await freshRoutes(creatorClaims);
      const create = await rc.orders.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-21",
            paymentMethod,
            items,
          }),
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
        new Request(
          `http://localhost/api/v1/orders/${order.id}/start-preparation`,
          {
            method: "POST",
            headers: { "Idempotency-Key": `432-sp-${order.id}-${idemTag}` },
          },
        ),
        { params: Promise.resolve({ id: String(order.id) }) },
      );
      const rmr = await freshRoutes(admin());
      await rmr.markReady.POST(
        new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
          method: "POST",
          headers: { "Idempotency-Key": `432-mr-${order.id}-${idemTag}` },
        }),
        { params: Promise.resolve({ id: String(order.id) }) },
      );
      const rcd = await freshRoutes(admin());
      const cd = await rcd.deliveries.POST(
        new Request("http://localhost/api/v1/deliveries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            assignedDriverId: driverClaims.id,
          }),
        }),
      );
      expect(cd.status).toBe(201);
      const { delivery } = (await cd.json()) as { delivery: { id: number } };

      const rs = await freshRoutes(driverClaims);
      const start = await rs.deliveriesStart.POST(
        new Request(
          `http://localhost/api/v1/deliveries/${delivery.id}/start`,
          {
            method: "POST",
            headers: {
              "Idempotency-Key": `432-dstart-${delivery.id}-${idemTag}`,
            },
          },
        ),
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
        new Request(
          `http://localhost/api/v1/deliveries/${deliveryId}/confirm-delivery`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": `432-cfm-${deliveryId}-${idem}`,
            },
            body: JSON.stringify(body),
          },
        ),
        { params: Promise.resolve({ id: String(deliveryId) }) },
      );
    }

    async function assertNoConfirmSideEffects(
      deliveryId: number,
      orderId: number,
      custodyBalanceBefore: string,
    ): Promise<void> {
      const { withRead } = await import("@/db/client");
      const {
        deliveries,
        orders,
        payments,
        bonuses,
        invoices,
        treasuryMovements,
      } = await import("@/db/schema");
      const drv = await withRead(undefined, (db) =>
        db
          .select()
          .from(deliveries)
          .where(eq(deliveries.id, deliveryId))
          .limit(1),
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
      // Driver custody balance must be exactly what it was before the
      // rejected confirm — the bridge never ran.
      expect(await readDriverCustodyBalance()).toBe(custodyBalanceBefore);
    }

    // ─────────────────── handover precision ───────────────────

    it("T-HO-PREC-004: handover amount=0.004 → 400 VALIDATION_FAILED + zero side effects", async () => {
      const custodyBefore = await readDriverCustodyBalance();
      const boxBefore = await readManagerBoxBalance();
      const movsBefore = await countHandoverMovementsForDriver();

      const res = await callHandover(driver(), { amount: 0.004 }, "ho-004");
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");

      expect(await readDriverCustodyBalance()).toBe(custodyBefore);
      expect(await readManagerBoxBalance()).toBe(boxBefore);
      expect(await countHandoverMovementsForDriver()).toBe(movsBefore);
    });

    it("T-HO-PREC-005: handover amount=0.005 → 400 VALIDATION_FAILED + zero side effects", async () => {
      const custodyBefore = await readDriverCustodyBalance();
      const boxBefore = await readManagerBoxBalance();
      const movsBefore = await countHandoverMovementsForDriver();

      const res = await callHandover(driver(), { amount: 0.005 }, "ho-005");
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");

      expect(await readDriverCustodyBalance()).toBe(custodyBefore);
      expect(await readManagerBoxBalance()).toBe(boxBefore);
      expect(await countHandoverMovementsForDriver()).toBe(movsBefore);
    });

    it("T-HO-PREC-HAPPY: handover amount=0.01 passes all layers (smallest-legal-unit regression)", async () => {
      const custodyBefore = Number(await readDriverCustodyBalance());
      const boxBefore = Number(await readManagerBoxBalance());

      const res = await callHandover(driver(), { amount: 0.01 }, "ho-happy");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        movementId: number;
        custodyBalance: string;
        managerBoxBalance: string;
      };
      expect(typeof body.movementId).toBe("number");
      expect(Number(body.custodyBalance)).toBeCloseTo(custodyBefore - 0.01, 2);
      expect(Number(body.managerBoxBalance)).toBeCloseTo(boxBefore + 0.01, 2);

      const { withRead } = await import("@/db/client");
      const { treasuryMovements } = await import("@/db/schema");
      const mov = await withRead(undefined, (db) =>
        db
          .select()
          .from(treasuryMovements)
          .where(eq(treasuryMovements.id, body.movementId))
          .limit(1),
      );
      expect(mov.length).toBe(1);
      expect(mov[0].category).toBe("driver_handover");
      expect(Number(mov[0].amount)).toBe(0.01);
    });

    // ─────────────────── confirm-delivery precision ───────────────────

    it("T-CD-PREC-004: confirm-delivery paidAmount=0.004 → 400 VALIDATION_FAILED + zero side effects", async () => {
      const { deliveryId, orderId } = await progressToReadyAndStart(
        seller(),
        driver(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "آجل",
        "cd-004",
      );
      const custodyBefore = await readDriverCustodyBalance();

      const res = await callConfirm(
        deliveryId,
        driver(),
        { paidAmount: 0.004, paymentMethod: "آجل" },
        "cd-004",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");

      await assertNoConfirmSideEffects(deliveryId, orderId, custodyBefore);
    });

    it("T-CD-PREC-005: confirm-delivery paidAmount=0.005 → 400 VALIDATION_FAILED + zero side effects", async () => {
      const { deliveryId, orderId } = await progressToReadyAndStart(
        seller(),
        driver(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "آجل",
        "cd-005",
      );
      const custodyBefore = await readDriverCustodyBalance();

      const res = await callConfirm(
        deliveryId,
        driver(),
        { paidAmount: 0.005, paymentMethod: "آجل" },
        "cd-005",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");

      await assertNoConfirmSideEffects(deliveryId, orderId, custodyBefore);
    });

    it("T-CD-PREC-HAPPY: confirm-delivery paidAmount=0.01 → 200 + payment=0.01 + sale_collection movement=0.01", async () => {
      // Credit order (paymentMethod="آجل") so BR-07 full-payment rule does
      // NOT apply; paidAmount=0.01 is a valid partial collection of a 100€
      // credit. This exercises the smallest-legal-unit path through Zod
      // refine, service round2, bridgeCollection, payments insert, and
      // orders.advance_paid update.
      const { deliveryId, orderId } = await progressToReadyAndStart(
        seller(),
        driver(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "آجل",
        "cd-happy",
      );
      const custodyBefore = Number(await readDriverCustodyBalance());

      const res = await callConfirm(
        deliveryId,
        driver(),
        { paidAmount: 0.01, paymentMethod: "آجل" },
        "cd-happy",
      );
      expect(res.status).toBe(200);

      const { withRead } = await import("@/db/client");
      const { orders, payments, treasuryMovements } = await import(
        "@/db/schema"
      );

      // Payment row exists with amount=0.01.
      const pays = await withRead(undefined, (db) =>
        db.select().from(payments).where(eq(payments.orderId, orderId)),
      );
      expect(pays.length).toBe(1);
      expect(Number(pays[0].amount)).toBe(0.01);
      expect(pays[0].type).toBe("collection");

      // sale_collection movement exists with amount=0.01 + to_account pointing at driver custody.
      const movs = await withRead(undefined, (db) =>
        db
          .select()
          .from(treasuryMovements)
          .where(
            and(
              eq(treasuryMovements.category, "sale_collection"),
              eq(treasuryMovements.referenceType, "order"),
              eq(treasuryMovements.referenceId, orderId),
            ),
          ),
      );
      expect(movs.length).toBe(1);
      expect(Number(movs[0].amount)).toBe(0.01);
      expect(movs[0].fromAccountId).toBeNull();
      expect(movs[0].toAccountId).not.toBeNull();

      // Driver custody balance bumped by exactly 0.01.
      expect(Number(await readDriverCustodyBalance())).toBeCloseTo(
        custodyBefore + 0.01,
        2,
      );

      // Order's advance_paid is 0.01, status="مؤكد", paymentStatus="partial".
      const ord = await withRead(undefined, (db) =>
        db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
      );
      expect(Number(ord[0].advancePaid)).toBe(0.01);
      expect(ord[0].status).toBe("مؤكد");
      expect(ord[0].paymentStatus).toBe("partial");
    });
  },
);
