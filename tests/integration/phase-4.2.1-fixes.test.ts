import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.2.1 — BR-52 hierarchy fix.
//
// Coverage (hierarchy-first — no happy path until hierarchy is proven):
//   T1   users service create(manager) → manager_box.parent = main_cash.id
//   T2   users service create(driver, managerId) → chain:
//          driver_custody.parent = manager_box.id
//          manager_box.parent   = main_cash.id
//   T3   migration backfill idempotency + zero-op when correct (NULL case)
//   T3a  migration backfill fixes manager_box.parent = main_bank.id
//          (the "wrong but non-NULL" parent path — proves the UPDATE uses
//          IS DISTINCT FROM, not just IS NULL)
//   T4   migration is idempotent: second UPDATE → 0 rows affected
//   T5   main_cash + main_bank untouched as roots (parent IS NULL)
//   T6   regression: end-to-end confirm-delivery (+ bridge) + handover
//          still works after the hierarchy fix

describe.skipIf(!HAS_DB)("Phase 4.2.1 — manager_box hierarchy (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let clientId: number;
  let productId: number;
  let managerId: number;
  let driverId: number;

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

    const hash = await hashPassword("test-pass-4.2.1");

    // Wire a seller + minimal catalogue via direct insert (no hierarchy
    // guarantees needed for these rows).
    sellerId = await withTxInRoute(undefined, async (tx) => {
      const s = await tx
        .insert(users)
        .values({
          username: "sel-421",
          password: hash,
          name: "Seller 421",
          role: "seller",
          active: true,
        })
        .returning({ id: users.id });
      return s[0].id;
    });

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({ name: "عميل 4.2.1", phone: "+33600421001", createdBy: "admin" })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "منتج 4.2.1",
          category: "cat-421",
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
        { key: "driver_custody_cap_eur", value: "2000" },
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
          category: "cat-421",
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
      handover: await import("@/app/api/v1/treasury/handover/route"),
    };
  }

  async function readMainCashId(): Promise<number> {
    const { withRead } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db
        .select({ id: treasuryAccounts.id })
        .from(treasuryAccounts)
        .where(eq(treasuryAccounts.type, "main_cash")),
    );
    expect(rows.length).toBe(1);
    return rows[0].id;
  }

  async function readAccountByOwner(
    ownerId: number,
    type: string,
  ): Promise<{ id: number; parentAccountId: number | null } | null> {
    const { withRead } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db
        .select({
          id: treasuryAccounts.id,
          parentAccountId: treasuryAccounts.parentAccountId,
        })
        .from(treasuryAccounts)
        .where(
          and(
            eq(treasuryAccounts.ownerUserId, ownerId),
            eq(treasuryAccounts.type, type),
          ),
        ),
    );
    return rows[0] ?? null;
  }

  // Run the canonical migration 0010 UPDATE statement on the current DB.
  // Used by T3/T3a/T4 to prove the backfill is the single source of fix.
  async function runBackfill(): Promise<number> {
    const { withTxInRoute } = await import("@/db/client");
    return withTxInRoute(undefined, async (tx) => {
      const res = await tx.execute(sql`
        UPDATE "treasury_accounts"
        SET "parent_account_id" = (
          SELECT "id" FROM "treasury_accounts"
          WHERE "type" = 'main_cash'
          ORDER BY "id" ASC LIMIT 1
        )
        WHERE "type" = 'manager_box'
          AND "parent_account_id" IS DISTINCT FROM (
            SELECT "id" FROM "treasury_accounts"
            WHERE "type" = 'main_cash'
            ORDER BY "id" ASC LIMIT 1
          )
          AND EXISTS (SELECT 1 FROM "treasury_accounts" WHERE "type" = 'main_cash');
      `);
      return (res as unknown as { rowCount?: number }).rowCount ?? 0;
    });
  }

  // ─────────── T1: new manager via users service ───────────

  it("T1: createUser(manager) → manager_box.parent = main_cash.id (never NULL)", async () => {
    const { withTxInRoute } = await import("@/db/client");
    const { createUser } = await import("@/modules/users/service");
    managerId = await withTxInRoute(undefined, async (tx) => {
      const u = await createUser(
        tx,
        {
          username: "mgr-421",
          password: "manager-pass-421!!",
          name: "Manager 421",
          role: "manager",
          profitSharePct: 0,
          profitShareStart: null,
          managerId: null,
        },
        "admin",
      );
      return u.id;
    });

    const mainCashId = await readMainCashId();
    const box = await readAccountByOwner(managerId, "manager_box");
    expect(box).not.toBeNull();
    expect(box!.parentAccountId).toBe(mainCashId);
    expect(box!.parentAccountId).not.toBeNull();
  });

  // ─────────── T2: new driver → full hierarchy chain ───────────

  it("T2: createUser(driver, managerId) → driver_custody.parent = manager_box.id ∧ manager_box.parent = main_cash.id", async () => {
    const { withTxInRoute } = await import("@/db/client");
    const { createUser } = await import("@/modules/users/service");
    driverId = await withTxInRoute(undefined, async (tx) => {
      const u = await createUser(
        tx,
        {
          username: "drv-421",
          password: "driver-pass-421!!",
          name: "Driver 421",
          role: "driver",
          profitSharePct: 0,
          profitShareStart: null,
          managerId,
        },
        "admin",
      );
      return u.id;
    });

    const mainCashId = await readMainCashId();
    const box = await readAccountByOwner(managerId, "manager_box");
    const custody = await readAccountByOwner(driverId, "driver_custody");
    expect(box).not.toBeNull();
    expect(custody).not.toBeNull();
    expect(custody!.parentAccountId).toBe(box!.id);
    expect(box!.parentAccountId).toBe(mainCashId);
  });

  // ─────────── T3: NULL parent → backfill rebinds ───────────

  it("T3: manager_box with parent_account_id=NULL is rebound to main_cash.id by the backfill UPDATE", async () => {
    const { withTxInRoute } = await import("@/db/client");
    const { users: usersTable, treasuryAccounts } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    // Create a stale-state manager_box via direct insert (bypassing the
    // Phase 4.2.1 fix in ensureManagerBox so we simulate pre-fix data).
    const hash = await hashPassword("stale-mgr-null");
    const staleMgrId = await withTxInRoute(undefined, async (tx) => {
      const u = await tx
        .insert(usersTable)
        .values({
          username: "mgr-stale-null",
          password: hash,
          name: "Stale NULL",
          role: "manager",
          active: true,
        })
        .returning({ id: usersTable.id });
      await tx.insert(treasuryAccounts).values({
        type: "manager_box",
        name: "صندوق Stale NULL",
        ownerUserId: u[0].id,
        parentAccountId: null, // the bug this tranche fixes
        balance: "0",
        active: 1,
      });
      return u[0].id;
    });

    // Pre-check: stale data IS NULL.
    const before = await readAccountByOwner(staleMgrId, "manager_box");
    expect(before!.parentAccountId).toBeNull();

    // Run the 0010 UPDATE.
    const affected = await runBackfill();
    expect(affected).toBeGreaterThanOrEqual(1);

    // Post-check: parent is now main_cash.id.
    const mainCashId = await readMainCashId();
    const after = await readAccountByOwner(staleMgrId, "manager_box");
    expect(after!.parentAccountId).toBe(mainCashId);
  });

  // ─────────── T3a: WRONG parent (main_bank) → backfill rebinds ───────────

  it("T3a: manager_box with parent_account_id=main_bank.id is rebound to main_cash.id (IS DISTINCT FROM, not just NULL)", async () => {
    const { withTxInRoute, withRead } = await import("@/db/client");
    const { users: usersTable, treasuryAccounts } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    // Capture the two roots.
    const mainCashId = await readMainCashId();
    const mainBankRows = await withRead(undefined, (db) =>
      db
        .select({ id: treasuryAccounts.id })
        .from(treasuryAccounts)
        .where(eq(treasuryAccounts.type, "main_bank")),
    );
    expect(mainBankRows.length).toBe(1);
    const mainBankId = mainBankRows[0].id;

    // Create stale manager_box parented to main_bank (wrong canonical).
    const hash = await hashPassword("stale-mgr-bank");
    const staleMgrId = await withTxInRoute(undefined, async (tx) => {
      const u = await tx
        .insert(usersTable)
        .values({
          username: "mgr-stale-bank",
          password: hash,
          name: "Stale Bank",
          role: "manager",
          active: true,
        })
        .returning({ id: usersTable.id });
      await tx.insert(treasuryAccounts).values({
        type: "manager_box",
        name: "صندوق Stale Bank",
        ownerUserId: u[0].id,
        parentAccountId: mainBankId, // wrong parent (non-NULL, non-canonical)
        balance: "0",
        active: 1,
      });
      return u[0].id;
    });

    // Pre-check: parent is main_bank.
    const before = await readAccountByOwner(staleMgrId, "manager_box");
    expect(before!.parentAccountId).toBe(mainBankId);

    // Run backfill.
    const affected = await runBackfill();
    expect(affected).toBeGreaterThanOrEqual(1);

    // Post-check: parent is now main_cash.id (NOT main_bank).
    const after = await readAccountByOwner(staleMgrId, "manager_box");
    expect(after!.parentAccountId).toBe(mainCashId);
    expect(after!.parentAccountId).not.toBe(mainBankId);
  });

  // ─────────── T4: idempotency ───────────

  it("T4: re-running the backfill when all manager_boxes are canonical → 0 rows affected", async () => {
    const affected = await runBackfill();
    expect(affected).toBe(0);
  });

  // ─────────── T5: roots untouched ───────────

  it("T5: main_cash + main_bank remain roots (parent IS NULL) after every fix above", async () => {
    const { withRead } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    const roots = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryAccounts)
        .where(
          sql`${treasuryAccounts.type} IN ('main_cash', 'main_bank')`,
        ),
    );
    expect(roots.length).toBe(2);
    for (const r of roots) {
      expect(r.parentAccountId).toBeNull();
    }
  });

  // ─────────── T6: regression — confirm-delivery + handover still works ───────────

  it("T6 regression: confirm-delivery (+ collection bridge) + handover still pass end-to-end", async () => {
    // Use the managerId + driverId created in T1/T2 via users service, so
    // the hierarchy under test is the ones we just proved canonical.
    const sellerClaims = { id: sellerId, username: "sel-421", role: "seller", name: "Seller" };
    const adminClaims = { id: adminUserId, username: "admin", role: "pm", name: "Admin" };
    const driverClaims = { id: driverId, username: "drv-421", role: "driver", name: "Driver" };

    const rc = await freshRoutes(sellerClaims);
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: "2026-04-21",
          items: [{ productId, quantity: 1, unitPrice: 100 }],
        }),
      }),
    );
    expect(create.status).toBe(201);
    const { order } = (await create.json()) as { order: { id: number } };

    const rsp = await freshRoutes(adminClaims);
    expect(
      (
        await rsp.startPrep.POST(
          new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
            method: "POST",
            headers: { "Idempotency-Key": `421-sp-${order.id}` },
          }),
          { params: Promise.resolve({ id: String(order.id) }) },
        )
      ).status,
    ).toBe(200);
    const rmr = await freshRoutes(adminClaims);
    expect(
      (
        await rmr.markReady.POST(
          new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
            method: "POST",
            headers: { "Idempotency-Key": `421-mr-${order.id}` },
          }),
          { params: Promise.resolve({ id: String(order.id) }) },
        )
      ).status,
    ).toBe(200);

    const rcd = await freshRoutes(adminClaims);
    const cd = await rcd.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, assignedDriverId: driverId }),
      }),
    );
    expect(cd.status).toBe(201);
    const { delivery } = (await cd.json()) as { delivery: { id: number } };

    const rs = await freshRoutes(driverClaims);
    expect(
      (
        await rs.deliveriesStart.POST(
          new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
            method: "POST",
            headers: { "Idempotency-Key": `421-dstart-${delivery.id}` },
          }),
          { params: Promise.resolve({ id: String(delivery.id) }) },
        )
      ).status,
    ).toBe(200);

    const rcf = await freshRoutes(driverClaims);
    const cfm = await rcf.deliveriesConfirm.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `421-cfm-${delivery.id}`,
        },
        body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(cfm.status).toBe(200);

    // Custody should now hold 100€.
    const custody = await readAccountByOwner(driverId, "driver_custody");
    expect(Number(custody?.id ?? 0)).toBeGreaterThan(0);
    // readAccountByOwner doesn't return balance; re-read.
    const { withRead } = await import("@/db/client");
    const { treasuryAccounts } = await import("@/db/schema");
    const custodyRow = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryAccounts)
        .where(eq(treasuryAccounts.id, custody!.id))
        .limit(1),
    );
    expect(Number(custodyRow[0].balance)).toBeCloseTo(100, 2);

    // Handover — drives custody → manager_box.
    const rho = await freshRoutes(driverClaims);
    const ho = await rho.handover.POST(
      new Request("http://localhost/api/v1/treasury/handover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `421-handover`,
        },
        body: JSON.stringify({ amount: 100 }),
      }),
    );
    expect(ho.status).toBe(200);

    const custodyAfter = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryAccounts)
        .where(eq(treasuryAccounts.id, custody!.id))
        .limit(1),
    );
    expect(Number(custodyAfter[0].balance)).toBeCloseTo(0, 2);

    // Manager box should now have 100€.
    const box = await readAccountByOwner(managerId, "manager_box");
    const boxRow = await withRead(undefined, (db) =>
      db
        .select()
        .from(treasuryAccounts)
        .where(eq(treasuryAccounts.id, box!.id))
        .limit(1),
    );
    expect(Number(boxRow[0].balance)).toBeCloseTo(100, 2);
    // And still parented to main_cash after the whole flow.
    const mainCashId = await readMainCashId();
    expect(boxRow[0].parentAccountId).toBe(mainCashId);
  });

  void wireManagerAndDrivers; // kept imported for parity with other phase-4.x suites; not used here
});
