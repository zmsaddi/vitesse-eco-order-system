import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 5.1a — Notifications API + emitters + X-Unread-Count header.
//
// Coverage:
//   CRUD:
//     T-NTF-LIST-OWN-ONLY, T-NTF-MARK-READ, T-NTF-MARK-ALL, T-NTF-PREFS-LAZY-SEED,
//     T-NTF-PREFS-UPDATE, T-NTF-PREFS-DISABLED-SKIPS-EMIT
//   Ownership:
//     T-NTF-NOT-OWNER (403), T-NTF-MARK-READ-MISSING (404)
//   Header:
//     T-NTF-UNREAD-HEADER-ON-ME, T-NTF-UNREAD-HEADER-ON-LIST,
//     T-NTF-UNREAD-HEADER-AFTER-MARK
//   Emitters (one per live event, anchored to an existing Phase 4 flow):
//     T-EMIT-ORDER-CREATED, T-EMIT-ORDER-STARTED-PREP,
//     T-EMIT-ORDER-READY-FOR-DELIVERY, T-EMIT-DELIVERY-CONFIRMED,
//     T-EMIT-PAYMENT-RECEIVED, T-EMIT-LOW-STOCK-THRESHOLD-CROSSING,
//     T-EMIT-NEW-TASK, T-EMIT-BONUS-CREATED, T-EMIT-SETTLEMENT-ISSUED,
//     T-EMIT-ORDER-CANCELLED, T-EMIT-DRIVER-HANDOVER-DONE

const D35_GOOD: Array<{ key: string; value: string }> = [
  { key: "shop_name", value: "VITESSE ECO SAS" },
  { key: "shop_legal_form", value: "SAS" },
  { key: "shop_siret", value: "12345678901234" },
  { key: "shop_siren", value: "123456789" },
  { key: "shop_ape", value: "4618Z" },
  { key: "shop_vat_number", value: "FR12345678901" },
  { key: "shop_address", value: "123 Rue de la Paix" },
  { key: "shop_city", value: "86000 Poitiers" },
  { key: "shop_capital_social", value: "10000" },
  { key: "shop_rcs_city", value: "Poitiers" },
  { key: "shop_rcs_number", value: "RCS Poitiers 123 456 789" },
  { key: "shop_iban", value: "FR7610057190010000000000001" },
  { key: "shop_bic", value: "CMBRFR2BARK" },
  { key: "shop_penalty_rate_annual", value: "10.5" },
  { key: "shop_recovery_fee_eur", value: "40" },
  { key: "vat_rate", value: "20" },
  { key: "max_discount_seller_pct", value: "5" },
  { key: "seller_bonus_fixed", value: "0" },
  { key: "seller_bonus_percentage", value: "0" },
  { key: "driver_bonus_fixed", value: "0" },
  { key: "driver_custody_cap_eur", value: "100000" },
];

describe.skipIf(!HAS_DB)(
  "Phase 5.1a — notifications API + emitters (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let sellerBId: number;
    let stockKeeperId: number;
    let managerId: number;
    let driverId: number;
    let clientId: number;
    let productId: number;
    let mainCashId: number;

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
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
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
        treasuryAccounts,
      } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-5.1a");

      const wired = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "51a",
          driverSuffixes: ["51a"],
          passwordHash: hash,
        }),
      );
      managerId = wired.managerId;
      driverId = wired.driverIds[0];

      [sellerId, sellerBId, stockKeeperId] = await withTxInRoute(
        undefined,
        async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-51a",
              password: hash,
              name: "Seller 51a",
              role: "seller",
              active: true,
            })
            .returning();
          const sb = await tx
            .insert(users)
            .values({
              username: "sel-51b",
              password: hash,
              name: "Seller 51b",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-51a",
              password: hash,
              name: "SK 51a",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          return [s[0].id, sb[0].id, sk[0].id];
        },
      );

      clientId = (
        await withTxInRoute(undefined, async (tx) =>
          tx
            .insert(clients)
            .values({
              name: "عميل 5.1a",
              phone: "+33600510001",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      productId = await withTxInRoute(undefined, async (tx) => {
        const p = await tx
          .insert(products)
          .values({
            name: "منتج 5.1a",
            category: "cat-51a",
            buyPrice: "40.00",
            sellPrice: "100.00",
            stock: "100.00", // start high so LOW_STOCK fires only when we explicitly drain
            lowStockThreshold: 3,
            createdBy: "admin",
          })
          .returning();
        for (const s of [...D35_GOOD]) {
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
            category: "cat-51a",
            sellerFixedPerUnit: "5",
            sellerPctOverage: "0",
            driverFixedPerDelivery: "3",
            active: true,
          })
          .onConflictDoNothing({ target: productCommissionRules.category });
        return p[0].id;
      });

      const accIds = await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(treasuryAccounts)
          .set({ balance: "10000.00" })
          .where(eq(treasuryAccounts.type, "main_cash"));
        const mc = await tx
          .select({ id: treasuryAccounts.id })
          .from(treasuryAccounts)
          .where(eq(treasuryAccounts.type, "main_cash"))
          .limit(1);
        return { mainCashId: mc[0].id };
      });
      mainCashId = accIds.mainCashId;
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
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return {
        me: await import("@/app/api/v1/me/route"),
        notifications: await import("@/app/api/v1/notifications/route"),
        notificationsMarkAll: await import(
          "@/app/api/v1/notifications/mark-all-read/route"
        ),
        notificationsMarkOne: await import(
          "@/app/api/v1/notifications/[id]/mark-read/route"
        ),
        notificationsPrefs: await import(
          "@/app/api/v1/notifications/preferences/route"
        ),
        orders: await import("@/app/api/v1/orders/route"),
        cancel: await import("@/app/api/v1/orders/[id]/cancel/route"),
        startPrep: await import(
          "@/app/api/v1/orders/[id]/start-preparation/route"
        ),
        markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
        deliveries: await import("@/app/api/v1/deliveries/route"),
        deliveriesStart: await import(
          "@/app/api/v1/deliveries/[id]/start/route"
        ),
        deliveriesConfirm: await import(
          "@/app/api/v1/deliveries/[id]/confirm-delivery/route"
        ),
        handover: await import("@/app/api/v1/treasury/handover/route"),
        settlements: await import("@/app/api/v1/settlements/route"),
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
      username: "sel-51a",
      role: "seller",
      name: "Seller",
    });
    const sellerB = () => ({
      id: sellerBId,
      username: "sel-51b",
      role: "seller",
      name: "Seller B",
    });
    const driver = () => ({
      id: driverId,
      username: "drv-51a",
      role: "driver",
      name: "Driver",
    });
    // stockKeeper + manager factories omitted — their ids are used directly
    // in notification-count assertions (no need for a session mock here).
    void (() => ({ _manager: managerId, _stockKeeper: stockKeeperId }));

    // ───────── helpers ─────────

    async function countNotificationsFor(
      userId: number,
      type?: string,
    ): Promise<number> {
      const { withRead } = await import("@/db/client");
      const { notifications } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select()
          .from(notifications)
          .where(
            type
              ? and(
                  eq(notifications.userId, userId),
                  eq(notifications.type, type),
                )
              : eq(notifications.userId, userId),
          ),
      );
      return rows.length;
    }

    async function createOrder(
      creator: ReturnType<typeof seller>,
      items: Array<{ productId: number; quantity: number; unitPrice: number }>,
      tag: string,
    ): Promise<number> {
      const r = await freshRoutes(creator);
      const res = await r.orders.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `51a-ord-${tag}`,
          },
          body: JSON.stringify({
            clientId,
            date: "2026-04-22",
            paymentMethod: "كاش",
            items,
          }),
        }),
      );
      if (res.status !== 201) {
        throw new Error(
          `createOrder: ${res.status} ${await res.text()}`,
        );
      }
      const body = (await res.json()) as { order: { id: number } };
      return body.order.id;
    }

    async function transitionOrder(
      orderId: number,
      tag: string,
    ): Promise<void> {
      const sp = await freshRoutes(admin());
      await sp.startPrep.POST(
        new Request(
          `http://localhost/api/v1/orders/${orderId}/start-preparation`,
          {
            method: "POST",
            headers: { "Idempotency-Key": `51a-sp-${orderId}-${tag}` },
          },
        ),
        { params: Promise.resolve({ id: String(orderId) }) },
      );
      const mr = await freshRoutes(admin());
      await mr.markReady.POST(
        new Request(`http://localhost/api/v1/orders/${orderId}/mark-ready`, {
          method: "POST",
          headers: { "Idempotency-Key": `51a-mr-${orderId}-${tag}` },
        }),
        { params: Promise.resolve({ id: String(orderId) }) },
      );
    }

    async function createDelivery(
      orderId: number,
      assignedDriverId: number,
    ): Promise<number> {
      const r = await freshRoutes(admin());
      const res = await r.deliveries.POST(
        new Request("http://localhost/api/v1/deliveries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId,
            assignedDriverId,
          }),
        }),
      );
      const body = (await res.json()) as { delivery: { id: number } };
      return body.delivery.id;
    }

    async function startAndConfirmDelivery(
      deliveryId: number,
      paidAmount: number,
      tag: string,
    ): Promise<void> {
      const s = await freshRoutes(driver());
      await s.deliveriesStart.POST(
        new Request(
          `http://localhost/api/v1/deliveries/${deliveryId}/start`,
          {
            method: "POST",
            headers: {
              "Idempotency-Key": `51a-ds-${deliveryId}-${tag}`,
            },
          },
        ),
        { params: Promise.resolve({ id: String(deliveryId) }) },
      );
      const c = await freshRoutes(driver());
      const res = await c.deliveriesConfirm.POST(
        new Request(
          `http://localhost/api/v1/deliveries/${deliveryId}/confirm-delivery`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": `51a-cfm-${deliveryId}-${tag}`,
            },
            body: JSON.stringify({
              paidAmount,
              paymentMethod: "كاش",
            }),
          },
        ),
        { params: Promise.resolve({ id: String(deliveryId) }) },
      );
      if (res.status !== 200) {
        throw new Error(
          `confirm: ${res.status} ${await res.text()}`,
        );
      }
    }

    // ───────── CRUD ─────────

    it("T-NTF-LIST-OWN-ONLY: user sees only their own notifications", async () => {
      // Seed: order created → pm/gm/manager/stock_keeper get rows. Seller does NOT.
      await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "list-own",
      );
      const r = await freshRoutes(seller());
      const res = await r.notifications.GET(
        new Request("http://localhost/api/v1/notifications"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ userId: number }> };
      for (const n of body.items) expect(n.userId).toBe(sellerId);
    });

    it("T-NTF-MARK-READ: flips read_at + idempotent replay", async () => {
      await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "mark-read",
      );
      // Admin has notifications; grab one.
      const r = await freshRoutes(admin());
      const list = (await (
        await r.notifications.GET(
          new Request("http://localhost/api/v1/notifications?limit=10&unread=true"),
        )
      ).json()) as { items: Array<{ id: number; readAt: string | null }> };
      expect(list.items.length).toBeGreaterThan(0);
      const target = list.items[0];

      const r2 = await freshRoutes(admin());
      const res = await r2.notificationsMarkOne.POST(
        new Request(
          `http://localhost/api/v1/notifications/${target.id}/mark-read`,
          { method: "POST" },
        ),
        { params: Promise.resolve({ id: String(target.id) }) },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        notification: { readAt: string | null };
      };
      expect(body.notification.readAt).not.toBeNull();

      // Replay returns 200 idempotently.
      const r3 = await freshRoutes(admin());
      const res2 = await r3.notificationsMarkOne.POST(
        new Request(
          `http://localhost/api/v1/notifications/${target.id}/mark-read`,
          { method: "POST" },
        ),
        { params: Promise.resolve({ id: String(target.id) }) },
      );
      expect(res2.status).toBe(200);
    });

    it("T-NTF-MARK-ALL: flips every unread in one call", async () => {
      await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "mark-all-a",
      );
      await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "mark-all-b",
      );
      const r = await freshRoutes(admin());
      const res = await r.notificationsMarkAll.POST(
        new Request("http://localhost/api/v1/notifications/mark-all-read", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { updatedCount: number };
      expect(body.updatedCount).toBeGreaterThanOrEqual(2);

      // After mark-all, unread count is 0.
      const r2 = await freshRoutes(admin());
      const after = (await (
        await r2.notifications.GET(
          new Request("http://localhost/api/v1/notifications?unread=true"),
        )
      ).json()) as { items: unknown[]; unreadCount: number };
      expect(after.unreadCount).toBe(0);
    });

    it("T-NTF-PREFS-LAZY-SEED: first GET creates 14 rows enabled=true", async () => {
      const r = await freshRoutes(sellerB());
      const res = await r.notificationsPrefs.GET(
        new Request("http://localhost/api/v1/notifications/preferences"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        preferences: Array<{ notificationType: string; enabled: boolean }>;
      };
      expect(body.preferences.length).toBe(14);
      for (const p of body.preferences) expect(p.enabled).toBe(true);
    });

    it("T-NTF-PREFS-UPDATE: PUT flips enabled", async () => {
      const r = await freshRoutes(sellerB());
      // Ensure seed exists first.
      await r.notificationsPrefs.GET(
        new Request("http://localhost/api/v1/notifications/preferences"),
      );
      const r2 = await freshRoutes(sellerB());
      const res = await r2.notificationsPrefs.PUT(
        new Request("http://localhost/api/v1/notifications/preferences", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            updates: [{ notificationType: "BONUS_CREATED", enabled: false }],
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        preferences: Array<{ notificationType: string; enabled: boolean }>;
      };
      const row = body.preferences.find(
        (p) => p.notificationType === "BONUS_CREATED",
      );
      expect(row?.enabled).toBe(false);
    });

    it("T-NTF-PREFS-DISABLED-SKIPS-EMIT: disabled pref → emit skips that user's row", async () => {
      // sellerB disabled BONUS_CREATED in the previous test. Confirm-delivery
      // on an order owned by sellerB should NOT insert a BONUS_CREATED row.
      const orderId = await createOrder(
        sellerB(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "prefs-skip",
      );
      await transitionOrder(orderId, "prefs-skip");
      const deliveryId = await createDelivery(orderId, driverId);
      await startAndConfirmDelivery(deliveryId, 100, "prefs-skip");

      const cnt = await countNotificationsFor(sellerBId, "BONUS_CREATED");
      expect(cnt).toBe(0);
    });

    it("T-NTF-NOT-OWNER: user A marks B's notification → 403 NOTIFICATION_NOT_OWNER", async () => {
      await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "not-owner",
      );
      const r = await freshRoutes(admin());
      const list = (await (
        await r.notifications.GET(
          new Request("http://localhost/api/v1/notifications?limit=1"),
        )
      ).json()) as { items: Array<{ id: number }> };
      const foreignId = list.items[0].id;

      const r2 = await freshRoutes(seller());
      const res = await r2.notificationsMarkOne.POST(
        new Request(
          `http://localhost/api/v1/notifications/${foreignId}/mark-read`,
          { method: "POST" },
        ),
        { params: Promise.resolve({ id: String(foreignId) }) },
      );
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("NOTIFICATION_NOT_OWNER");
    });

    it("T-NTF-MARK-READ-MISSING: id does not exist → 404", async () => {
      const r = await freshRoutes(admin());
      const res = await r.notificationsMarkOne.POST(
        new Request(
          "http://localhost/api/v1/notifications/999999999/mark-read",
          { method: "POST" },
        ),
        { params: Promise.resolve({ id: "999999999" }) },
      );
      expect(res.status).toBe(404);
    });

    // ───────── X-Unread-Count header ─────────

    it("T-NTF-UNREAD-HEADER-ON-ME: /me response carries the header", async () => {
      await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "hdr-me",
      );
      const r = await freshRoutes(admin());
      const res = await r.me.GET(new Request("http://localhost/api/v1/me"));
      expect(res.status).toBe(200);
      const header = res.headers.get("x-unread-count");
      expect(header).not.toBeNull();
      expect(Number(header)).toBeGreaterThanOrEqual(1);
    });

    it("T-NTF-UNREAD-HEADER-ON-LIST: /notifications list response carries the header", async () => {
      const r = await freshRoutes(admin());
      const res = await r.notifications.GET(
        new Request("http://localhost/api/v1/notifications?limit=5"),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("x-unread-count")).not.toBeNull();
    });

    it("T-NTF-UNREAD-HEADER-AFTER-MARK: header drops to 0 after mark-all", async () => {
      const r1 = await freshRoutes(admin());
      await r1.notificationsMarkAll.POST(
        new Request("http://localhost/api/v1/notifications/mark-all-read", {
          method: "POST",
        }),
      );
      const r2 = await freshRoutes(admin());
      const res = await r2.me.GET(new Request("http://localhost/api/v1/me"));
      expect(res.headers.get("x-unread-count")).toBe("0");
    });

    // ───────── Emitters (one assertion per live event) ─────────

    it("T-EMIT-ORDER-CREATED: pm/gm/manager/stock_keeper receive rows", async () => {
      const before = {
        admin: await countNotificationsFor(adminUserId, "ORDER_CREATED"),
        manager: await countNotificationsFor(managerId, "ORDER_CREATED"),
        sk: await countNotificationsFor(stockKeeperId, "ORDER_CREATED"),
      };
      await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "emit-oc",
      );
      expect(await countNotificationsFor(adminUserId, "ORDER_CREATED")).toBe(
        before.admin + 1,
      );
      expect(
        await countNotificationsFor(managerId, "ORDER_CREATED"),
      ).toBe(before.manager + 1);
      expect(
        await countNotificationsFor(stockKeeperId, "ORDER_CREATED"),
      ).toBe(before.sk + 1);
    });

    it("T-EMIT-ORDER-STARTED-PREP: stock_keeper only receives the row", async () => {
      const orderId = await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "emit-sp",
      );
      const skBefore = await countNotificationsFor(
        stockKeeperId,
        "ORDER_STARTED_PREPARATION",
      );
      const adminBefore = await countNotificationsFor(
        adminUserId,
        "ORDER_STARTED_PREPARATION",
      );
      await transitionOrder(orderId, "emit-sp");
      expect(
        await countNotificationsFor(
          stockKeeperId,
          "ORDER_STARTED_PREPARATION",
        ),
      ).toBe(skBefore + 1);
      // Admin does not receive ORDER_STARTED_PREPARATION.
      expect(
        await countNotificationsFor(
          adminUserId,
          "ORDER_STARTED_PREPARATION",
        ),
      ).toBe(adminBefore);
    });

    it("T-EMIT-ORDER-READY-FOR-DELIVERY + NEW-TASK: assigned driver receives both", async () => {
      const orderId = await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "emit-ready",
      );
      await transitionOrder(orderId, "emit-ready");
      const readyBefore = await countNotificationsFor(
        driverId,
        "ORDER_READY_FOR_DELIVERY",
      );
      const taskBefore = await countNotificationsFor(driverId, "NEW_TASK");
      await createDelivery(orderId, driverId);
      expect(
        await countNotificationsFor(driverId, "ORDER_READY_FOR_DELIVERY"),
      ).toBe(readyBefore + 1);
      expect(await countNotificationsFor(driverId, "NEW_TASK")).toBe(
        taskBefore + 1,
      );
    });

    it("T-EMIT-DELIVERY-CONFIRMED + PAYMENT-RECEIVED: pm/gm + seller + pm/gm on paid", async () => {
      const orderId = await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "emit-conf",
      );
      await transitionOrder(orderId, "emit-conf");
      const deliveryId = await createDelivery(orderId, driverId);
      const confBefore = await countNotificationsFor(
        sellerId,
        "DELIVERY_CONFIRMED",
      );
      const payBefore = await countNotificationsFor(
        adminUserId,
        "PAYMENT_RECEIVED",
      );
      await startAndConfirmDelivery(deliveryId, 100, "emit-conf");
      expect(
        await countNotificationsFor(sellerId, "DELIVERY_CONFIRMED"),
      ).toBe(confBefore + 1);
      expect(
        await countNotificationsFor(adminUserId, "PAYMENT_RECEIVED"),
      ).toBe(payBefore + 1);
    });

    it("T-EMIT-LOW-STOCK: decrement past threshold fires LOW_STOCK to pm/gm/stock_keeper", async () => {
      // Drain stock down to just above threshold first, then order enough to cross.
      const { withTxInRoute } = await import("@/db/client");
      const { products } = await import("@/db/schema");
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(products)
          .set({ stock: "5.00", lowStockThreshold: 3 })
          .where(eq(products.id, productId));
      });
      const before = await countNotificationsFor(adminUserId, "LOW_STOCK");
      await createOrder(
        seller(),
        [{ productId, quantity: 3, unitPrice: 100 }], // 5 → 2, crosses threshold=3
        "emit-low",
      );
      expect(await countNotificationsFor(adminUserId, "LOW_STOCK")).toBe(
        before + 1,
      );
    });

    it("T-EMIT-BONUS-CREATED: seller + driver receive bonus rows on confirm", async () => {
      // Refill stock so order creation succeeds.
      const { withTxInRoute } = await import("@/db/client");
      const { products } = await import("@/db/schema");
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(products)
          .set({ stock: "100.00" })
          .where(eq(products.id, productId));
      });

      const orderId = await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "emit-bonus",
      );
      await transitionOrder(orderId, "emit-bonus");
      const deliveryId = await createDelivery(orderId, driverId);
      const sellerBefore = await countNotificationsFor(
        sellerId,
        "BONUS_CREATED",
      );
      const driverBefore = await countNotificationsFor(
        driverId,
        "BONUS_CREATED",
      );
      await startAndConfirmDelivery(deliveryId, 100, "emit-bonus");
      expect(
        await countNotificationsFor(sellerId, "BONUS_CREATED"),
      ).toBeGreaterThan(sellerBefore);
      expect(
        await countNotificationsFor(driverId, "BONUS_CREATED"),
      ).toBeGreaterThan(driverBefore);
    });

    it("T-EMIT-SETTLEMENT-ISSUED: target user receives reward notification", async () => {
      const before = await countNotificationsFor(
        driverId,
        "SETTLEMENT_ISSUED",
      );
      const r = await freshRoutes(admin());
      const res = await r.settlements.POST(
        new Request("http://localhost/api/v1/settlements", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": "51a-reward-driver",
          },
          body: JSON.stringify({
            kind: "reward",
            userId: driverId,
            amount: 50,
            fromAccountId: mainCashId,
            paymentMethod: "كاش",
          }),
        }),
      );
      expect(res.status).toBe(200);
      expect(
        await countNotificationsFor(driverId, "SETTLEMENT_ISSUED"),
      ).toBe(before + 1);
    });

    it("T-EMIT-ORDER-CANCELLED: pm/gm + seller + linked driver all receive", async () => {
      const orderId = await createOrder(
        seller(),
        [{ productId, quantity: 1, unitPrice: 100 }],
        "emit-cnl",
      );
      // Transition + create delivery so there's a linked driver.
      await transitionOrder(orderId, "emit-cnl");
      await createDelivery(orderId, driverId);

      const adminBefore = await countNotificationsFor(
        adminUserId,
        "ORDER_CANCELLED",
      );
      const sellerBefore = await countNotificationsFor(
        sellerId,
        "ORDER_CANCELLED",
      );
      const driverBefore = await countNotificationsFor(
        driverId,
        "ORDER_CANCELLED",
      );

      const r = await freshRoutes(admin());
      const res = await r.cancel.POST(
        new Request(`http://localhost/api/v1/orders/${orderId}/cancel`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `51a-cnl-${orderId}`,
          },
          body: JSON.stringify({
            reason: "test cancel",
            returnToStock: true,
            sellerBonusAction: "cancel_unpaid",
            driverBonusAction: "cancel_unpaid",
          }),
        }),
        { params: Promise.resolve({ id: String(orderId) }) },
      );
      expect(res.status).toBe(200);
      expect(
        await countNotificationsFor(adminUserId, "ORDER_CANCELLED"),
      ).toBe(adminBefore + 1);
      expect(await countNotificationsFor(sellerId, "ORDER_CANCELLED")).toBe(
        sellerBefore + 1,
      );
      expect(await countNotificationsFor(driverId, "ORDER_CANCELLED")).toBe(
        driverBefore + 1,
      );
    });

    it("T-EMIT-DRIVER-HANDOVER-DONE: manager receives the row", async () => {
      // Driver must have non-zero custody for handover. Pre-fund.
      const { withTxInRoute } = await import("@/db/client");
      const { treasuryAccounts } = await import("@/db/schema");
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(treasuryAccounts)
          .set({ balance: "50.00" })
          .where(
            and(
              eq(treasuryAccounts.type, "driver_custody"),
              eq(treasuryAccounts.ownerUserId, driverId),
            ),
          );
      });
      const before = await countNotificationsFor(
        managerId,
        "DRIVER_HANDOVER_DONE",
      );
      const r = await freshRoutes(driver());
      const res = await r.handover.POST(
        new Request("http://localhost/api/v1/treasury/handover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": "51a-handover-emit",
          },
          body: JSON.stringify({ amount: 25 }),
        }),
      );
      expect(res.status).toBe(200);
      expect(
        await countNotificationsFor(managerId, "DRIVER_HANDOVER_DONE"),
      ).toBe(before + 1);
    });

    // Silence unused-binding warnings when iterating.
    void inArray;
  },
);
