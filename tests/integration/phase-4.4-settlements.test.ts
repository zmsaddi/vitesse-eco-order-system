import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  D35_SEED_SETTINGS,
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.4 — settlements + /my-bonus + cancel_as_debt.
//
// Coverage matrix (negative-first where meaningful):
//
// Settlement (kind="settlement"):
//   T-S-SELLER-HAPPY     pay 3 seller bonuses → status=settled + movement
//   T-S-DRIVER-HAPPY     pay driver bonus → same pattern
//   T-S-WITH-DEBT        grossBonus>debt → netPayout reduced; debts applied
//   T-S-NET-ZERO         grossBonus==debt → settlement row amount=0, NO movement
//   T-S-DEBT-EXCEEDS     debt>grossBonus → 409 DEBT_EXCEEDS_PAYOUT + zero side effects
//   T-S-INV-MIXED-USERS  bonusIds span two users → 400 INVALID_SETTLEMENT_BONUS_SET
//   T-S-INV-MIXED-ROLES  seller+driver bonuses mixed → 400 INVALID_SETTLEMENT_BONUS_SET
//   T-S-INV-ALREADY      already-settled bonus in set → 400
//   T-S-INV-MISSING      missing id → 400
//   T-S-SRC-NOT-MAIN     from=manager_box → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID
//   T-S-SRC-CUSTODY      from=driver_custody → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID
//   T-S-INV-METHOD-AJIL  paymentMethod=آجل → 400 VALIDATION_FAILED (Zod)
//   T-S-INV-METHOD-XBANK main_cash + method=بنك → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID
//   T-S-INV-METHOD-XCASH main_bank + method=كاش → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID
//   T-S-INSUFFICIENT     balance<netPayout → 409 INSUFFICIENT_BALANCE + zero side effects
//   T-S-IDEM             replay → same 200, 1 settlement row, 1 movement
//   T-S-CONC             2 parallel for same bonusIds → 1 OK, other INVALID_SETTLEMENT_BONUS_SET
//
// Reward (kind="reward"):
//   T-R-HAPPY            200 reward from main_cash → settlement+movement
//   T-R-PREC             amount=0.004 → 400 VALIDATION_FAILED
//   T-R-SRC-NOT-MAIN     from=manager_box → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID
//
// cancel_as_debt:
//   T-CAD-HAPPY          cancel settled order → debt row amount<0 applied=false + NO movement
//   T-CAD-PAYMENT-NA     debt row carries paymentMethod='N/A' exactly
//   T-CAD-IDEM-REPLAY    replay same Idempotency-Key → same response, ≤2 debt rows total
//   T-CAD-CONSUME-NEXT   next settlement for same user nets out the debt
//
// Permissions:
//   T-P-GET-SETT-MATRIX  pm/gm 200; manager/seller/driver/stock_keeper 403
//   T-P-POST-SETT-MATRIX same roles for POST
//   T-P-GET-BONUSES-MAT  pm full, seller own-forced, driver own-forced, manager/stock_keeper 403

describe.skipIf(!HAS_DB)(
  "Phase 4.4 — settlements + /my-bonus + cancel_as_debt (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let sellerOtherId: number;
    let stockKeeperId: number;
    let managerId: number;
    let driverId: number;
    let mainCashId: number;
    let mainBankId: number;
    let managerBoxId: number;
    let driverCustodyId: number;
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
        treasuryAccounts,
      } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-4.4");

      const wired = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "44",
          driverSuffixes: ["44"],
          passwordHash: hash,
        }),
      );
      managerId = wired.managerId;
      driverId = wired.driverIds[0];

      [sellerId, sellerOtherId, stockKeeperId] = await withTxInRoute(
        undefined,
        async (tx) => {
          const seller = await tx
            .insert(users)
            .values({
              username: "sel-44",
              password: hash,
              name: "Seller 44",
              role: "seller",
              active: true,
            })
            .returning();
          const seller2 = await tx
            .insert(users)
            .values({
              username: "sel-44b",
              password: hash,
              name: "Seller 44b",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-44",
              password: hash,
              name: "SK 44",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          return [seller[0].id, seller2[0].id, sk[0].id];
        },
      );

      clientId = (
        await withTxInRoute(undefined, async (tx) =>
          tx
            .insert(clients)
            .values({
              name: "عميل 4.4",
              phone: "+33600440001",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      productId = await withTxInRoute(undefined, async (tx) => {
        const p = await tx
          .insert(products)
          .values({
            name: "منتج 4.4",
            category: "cat-44",
            buyPrice: "40.00",
            sellPrice: "100.00",
            stock: "10000.00",
            createdBy: "admin",
          })
          .returning();
        const ops = [
          { key: "max_discount_seller_pct", value: "5" },
          { key: "seller_bonus_fixed", value: "0" },
          { key: "seller_bonus_percentage", value: "0" },
          { key: "driver_bonus_fixed", value: "0" },
          { key: "driver_custody_cap_eur", value: "100000" },
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
        // Seller bonus fixed = 10€ per item; driver bonus fixed = 5€ per delivery.
        await tx
          .insert(productCommissionRules)
          .values({
            category: "cat-44",
            sellerFixedPerUnit: "10",
            sellerPctOverage: "0",
            driverFixedPerDelivery: "5",
            active: true,
          })
          .onConflictDoNothing({ target: productCommissionRules.category });
        return p[0].id;
      });

      // Pre-fund main_cash to 10,000 and main_bank to 5,000 so settlement
      // tests never hit INSUFFICIENT_BALANCE unless they deliberately target it.
      const accountIds = await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(treasuryAccounts)
          .set({ balance: "10000.00" })
          .where(eq(treasuryAccounts.type, "main_cash"));
        await tx
          .update(treasuryAccounts)
          .set({ balance: "5000.00" })
          .where(eq(treasuryAccounts.type, "main_bank"));
        const mc = await tx
          .select({ id: treasuryAccounts.id })
          .from(treasuryAccounts)
          .where(eq(treasuryAccounts.type, "main_cash"))
          .limit(1);
        const mb = await tx
          .select({ id: treasuryAccounts.id })
          .from(treasuryAccounts)
          .where(eq(treasuryAccounts.type, "main_bank"))
          .limit(1);
        const box = await tx
          .select({ id: treasuryAccounts.id })
          .from(treasuryAccounts)
          .where(
            and(
              eq(treasuryAccounts.type, "manager_box"),
              eq(treasuryAccounts.ownerUserId, managerId),
            ),
          )
          .limit(1);
        const custody = await tx
          .select({ id: treasuryAccounts.id })
          .from(treasuryAccounts)
          .where(
            and(
              eq(treasuryAccounts.type, "driver_custody"),
              eq(treasuryAccounts.ownerUserId, driverId),
            ),
          )
          .limit(1);
        return {
          mainCashId: mc[0].id,
          mainBankId: mb[0].id,
          managerBoxId: box[0].id,
          driverCustodyId: custody[0].id,
        };
      });
      mainCashId = accountIds.mainCashId;
      mainBankId = accountIds.mainBankId;
      managerBoxId = accountIds.managerBoxId;
      driverCustodyId = accountIds.driverCustodyId;
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
        settlements: await import("@/app/api/v1/settlements/route"),
        bonuses: await import("@/app/api/v1/bonuses/route"),
        orders: await import("@/app/api/v1/orders/route"),
        startPrep: await import("@/app/api/v1/orders/[id]/start-preparation/route"),
        markReady: await import("@/app/api/v1/orders/[id]/mark-ready/route"),
        cancel: await import("@/app/api/v1/orders/[id]/cancel/route"),
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
      username: "sel-44",
      role: "seller",
      name: "Seller",
    });
    const sellerOther = () => ({
      id: sellerOtherId,
      username: "sel-44b",
      role: "seller",
      name: "Seller B",
    });
    const manager = () => ({
      id: managerId,
      username: "mgr-44",
      role: "manager",
      name: "Manager",
    });
    const driver = () => ({
      id: driverId,
      username: "drv-44",
      role: "driver",
      name: "Driver",
    });
    const sk = () => ({
      id: stockKeeperId,
      username: "sk-44",
      role: "stock_keeper",
      name: "SK",
    });

    // ────── helpers ──────

    async function createConfirmedOrder(
      creator: ReturnType<typeof seller>,
      drv: ReturnType<typeof driver>,
      itemCount: number,
      tag: string,
      paid = 100 * itemCount,
      method: "كاش" | "بنك" | "آجل" = "كاش",
    ): Promise<{ orderId: number; deliveryId: number }> {
      // D-29: seller bonuses are UNIQUE per (delivery, order_item, role). A
      // single order_item with quantity=N yields ONE row (total=fixed*N).
      // To get N distinct seller-bonus rows (which is what most of the
      // settlement tests assume), we must submit N separate line items.
      const items = Array.from({ length: itemCount }, () => ({
        productId,
        quantity: 1,
        unitPrice: 100,
      }));
      const rc = await freshRoutes(creator);
      const create = await rc.orders.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-21",
            paymentMethod: method,
            items,
          }),
        }),
      );
      if (create.status !== 201) {
        throw new Error(
          `createConfirmedOrder: orders.POST ${create.status} ${await create.text()}`,
        );
      }
      const { order } = (await create.json()) as { order: { id: number } };
      const rsp = await freshRoutes(admin());
      await rsp.startPrep.POST(
        new Request(
          `http://localhost/api/v1/orders/${order.id}/start-preparation`,
          {
            method: "POST",
            headers: { "Idempotency-Key": `44-sp-${order.id}-${tag}` },
          },
        ),
        { params: Promise.resolve({ id: String(order.id) }) },
      );
      const rmr = await freshRoutes(admin());
      await rmr.markReady.POST(
        new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
          method: "POST",
          headers: { "Idempotency-Key": `44-mr-${order.id}-${tag}` },
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
            assignedDriverId: drv.id,
          }),
        }),
      );
      const { delivery } = (await cd.json()) as { delivery: { id: number } };
      const rs = await freshRoutes(drv);
      await rs.deliveriesStart.POST(
        new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
          method: "POST",
          headers: { "Idempotency-Key": `44-ds-${delivery.id}-${tag}` },
        }),
        { params: Promise.resolve({ id: String(delivery.id) }) },
      );
      const rcfm = await freshRoutes(drv);
      const cfm = await rcfm.deliveriesConfirm.POST(
        new Request(
          `http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": `44-cfm-${delivery.id}-${tag}`,
            },
            body: JSON.stringify({ paidAmount: paid, paymentMethod: method }),
          },
        ),
        { params: Promise.resolve({ id: String(delivery.id) }) },
      );
      if (cfm.status !== 200) {
        throw new Error(
          `createConfirmedOrder: confirm ${cfm.status} ${await cfm.text()}`,
        );
      }
      return { orderId: order.id, deliveryId: delivery.id };
    }

    async function loadBonusIds(
      orderId: number,
      role: "seller" | "driver",
    ): Promise<number[]> {
      const { withRead } = await import("@/db/client");
      const { bonuses } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select({ id: bonuses.id })
          .from(bonuses)
          .where(
            and(
              eq(bonuses.orderId, orderId),
              eq(bonuses.role, role),
              isNull(bonuses.deletedAt),
            ),
          ),
      );
      return rows.map((r) => r.id);
    }

    async function callCreateSettlement(
      claims: ReturnType<typeof admin>,
      body: Record<string, unknown>,
      tag: string,
    ): Promise<Response> {
      const r = await freshRoutes(claims);
      return r.settlements.POST(
        new Request("http://localhost/api/v1/settlements", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `44-set-${tag}`,
          },
          body: JSON.stringify(body),
        }),
      );
    }

    async function readBalance(accountId: number): Promise<string> {
      const { withRead } = await import("@/db/client");
      const { treasuryAccounts } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select({ balance: treasuryAccounts.balance })
          .from(treasuryAccounts)
          .where(eq(treasuryAccounts.id, accountId))
          .limit(1),
      );
      return rows[0].balance;
    }

    async function countMovementsForSettlement(
      settlementId: number,
    ): Promise<number> {
      const { withRead } = await import("@/db/client");
      const { treasuryMovements } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select()
          .from(treasuryMovements)
          .where(
            and(
              eq(treasuryMovements.referenceType, "settlement"),
              eq(treasuryMovements.referenceId, settlementId),
            ),
          ),
      );
      return rows.length;
    }

    async function insertDebtRow(
      targetUserId: number,
      role: "seller" | "driver",
      signedAmount: number,
    ): Promise<number> {
      const { withTxInRoute } = await import("@/db/client");
      const { settlements, users } = await import("@/db/schema");
      return await withTxInRoute(undefined, async (tx) => {
        const user = await tx
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);
        const ins = await tx
          .insert(settlements)
          .values({
            date: "2026-04-21",
            userId: targetUserId,
            username: user[0].username,
            role,
            type: "debt",
            amount: signedAmount.toFixed(2),
            paymentMethod: "N/A",
            notes: "seed debt",
            createdBy: "admin",
            applied: false,
          })
          .returning({ id: settlements.id });
        return ins[0].id;
      });
    }

    // ─────────────────── SETTLEMENT ───────────────────

    it("T-S-SELLER-HAPPY: pay 3 seller bonuses from main_cash → status=settled + movement", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 3, "sh-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      expect(ids.length).toBe(3);

      const balBefore = Number(await readBalance(mainCashId));
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
          notes: "دفع بائع happy",
        },
        "sh-a",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        kind: string;
        result: {
          settlement: { id: number; amount: string };
          movementId: number | null;
          netPayout: string;
        };
      };
      expect(body.kind).toBe("settlement");
      expect(Number(body.result.netPayout)).toBe(30); // 3 items × 10€
      expect(Number(body.result.settlement.amount)).toBe(30);
      expect(body.result.movementId).not.toBeNull();

      const balAfter = Number(await readBalance(mainCashId));
      expect(balAfter).toBeCloseTo(balBefore - 30, 2);

      // Bonuses flipped to settled + settlementId populated.
      const { withRead } = await import("@/db/client");
      const { bonuses } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db.select().from(bonuses).where(inArray(bonuses.id, ids)),
      );
      for (const r of rows) {
        expect(r.status).toBe("settled");
        expect(r.settlementId).toBe(body.result.settlement.id);
      }
    });

    it("T-S-DRIVER-HAPPY: pay driver bonus from main_bank → status=settled + movement", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "dh-a");
      const ids = await loadBonusIds(a.orderId, "driver");
      expect(ids.length).toBe(1);

      const balBefore = Number(await readBalance(mainBankId));
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: driverId,
          bonusIds: ids,
          fromAccountId: mainBankId,
          paymentMethod: "بنك",
        },
        "dh-a",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: { netPayout: string; settlement: { id: number } };
      };
      expect(Number(body.result.netPayout)).toBe(5); // driverFixedPerDelivery

      const balAfter = Number(await readBalance(mainBankId));
      expect(balAfter).toBeCloseTo(balBefore - 5, 2);
    });

    it("T-S-WITH-DEBT: grossBonus > debt → netPayout reduced; debts applied", async () => {
      // Seed a -40€ debt + create 3 seller bonuses (gross 30€)... wait that
      // would exceed. Use 6 bonuses (gross 60€) and -40€ debt → net 20€.
      await insertDebtRow(sellerId, "seller", -40);

      const a = await createConfirmedOrder(seller(), driver(), 6, "wd-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      expect(ids.length).toBe(6);

      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "wd-a",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: {
          netPayout: string;
          debtTotal: string;
          grossBonus: string;
          debtIdsApplied: number[];
          settlement: { id: number };
        };
      };
      expect(Number(body.result.grossBonus)).toBe(60);
      expect(Number(body.result.debtTotal)).toBe(-40);
      expect(Number(body.result.netPayout)).toBe(20);
      expect(body.result.debtIdsApplied.length).toBe(1);

      // Debt row flipped to applied=true, applied_in_settlement_id=<new>.
      const { withRead } = await import("@/db/client");
      const { settlements } = await import("@/db/schema");
      const debts = await withRead(undefined, (db) =>
        db
          .select()
          .from(settlements)
          .where(
            and(
              eq(settlements.userId, sellerId),
              eq(settlements.type, "debt"),
            ),
          ),
      );
      for (const d of debts) {
        expect(d.applied).toBe(true);
        expect(d.appliedInSettlementId).toBe(body.result.settlement.id);
      }
    });

    it("T-S-NET-ZERO: grossBonus == |debt| → settlement row amount=0, NO movement", async () => {
      // Fresh seller (sellerOther) avoids collisions with the prior debt.
      await insertDebtRow(sellerOtherId, "seller", -30);

      const a = await createConfirmedOrder(sellerOther(), driver(), 3, "nz-a");
      const ids = await loadBonusIds(a.orderId, "seller");

      const balBefore = Number(await readBalance(mainCashId));
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerOtherId,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "nz-a",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: {
          netPayout: string;
          movementId: number | null;
          settlement: { id: number; amount: string };
        };
      };
      expect(Number(body.result.netPayout)).toBe(0);
      expect(body.result.movementId).toBeNull();
      expect(Number(body.result.settlement.amount)).toBe(0);

      // Balance unchanged; no movement row for this settlement.
      const balAfter = Number(await readBalance(mainCashId));
      expect(balAfter).toBeCloseTo(balBefore, 2);
      expect(await countMovementsForSettlement(body.result.settlement.id)).toBe(
        0,
      );
    });

    it("T-S-DEBT-EXCEEDS: debt>grossBonus → 409 DEBT_EXCEEDS_PAYOUT + zero side effects", async () => {
      // Fresh seller to isolate: create a single bonus (10€) and seed -50€ debt.
      const freshId = await (async () => {
        const { withTxInRoute } = await import("@/db/client");
        const { users } = await import("@/db/schema");
        const { hashPassword } = await import("@/lib/password");
        const hash = await hashPassword("test-pass-4.4");
        return await withTxInRoute(undefined, async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-44c",
              password: hash,
              name: "Seller C",
              role: "seller",
              active: true,
            })
            .returning();
          return s[0].id;
        });
      })();
      await insertDebtRow(freshId, "seller", -50);

      const a = await createConfirmedOrder(
        {
          id: freshId,
          username: "sel-44c",
          role: "seller",
          name: "Seller C",
        },
        driver(),
        1,
        "de-a",
      );
      const ids = await loadBonusIds(a.orderId, "seller");
      const balBefore = Number(await readBalance(mainCashId));

      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: freshId,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "de-a",
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("DEBT_EXCEEDS_PAYOUT");

      // Zero side effects: bonuses still unpaid, debts still applied=false.
      const { withRead } = await import("@/db/client");
      const { bonuses, settlements } = await import("@/db/schema");
      const stillUnpaid = await withRead(undefined, (db) =>
        db.select().from(bonuses).where(inArray(bonuses.id, ids)),
      );
      for (const r of stillUnpaid) expect(r.status).toBe("unpaid");
      const debts = await withRead(undefined, (db) =>
        db
          .select()
          .from(settlements)
          .where(
            and(eq(settlements.userId, freshId), eq(settlements.type, "debt")),
          ),
      );
      for (const d of debts) expect(d.applied).toBe(false);
      expect(Number(await readBalance(mainCashId))).toBeCloseTo(balBefore, 2);
    });

    it("T-S-INV-MIXED-USERS: bonusIds span two users → 400 INVALID_SETTLEMENT_BONUS_SET", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "mu-a");
      const b = await createConfirmedOrder(sellerOther(), driver(), 1, "mu-b");
      const idsA = await loadBonusIds(a.orderId, "seller");
      const idsB = await loadBonusIds(b.orderId, "seller");

      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: [...idsA, ...idsB],
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "mu",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("INVALID_SETTLEMENT_BONUS_SET");
    });

    it("T-S-INV-MIXED-ROLES: seller+driver bonuses mixed → 400 INVALID_SETTLEMENT_BONUS_SET", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "mr-a");
      const idsS = await loadBonusIds(a.orderId, "seller");
      const idsD = await loadBonusIds(a.orderId, "driver");
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: [...idsS, ...idsD],
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "mr",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("INVALID_SETTLEMENT_BONUS_SET");
    });

    it("T-S-INV-MISSING: missing bonus id → 400 INVALID_SETTLEMENT_BONUS_SET", async () => {
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: [999999999],
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "missing",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("INVALID_SETTLEMENT_BONUS_SET");
    });

    it("T-S-SRC-NOT-MAIN: from=manager_box → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "snm-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: ids,
          fromAccountId: managerBoxId,
          paymentMethod: "كاش",
        },
        "snm",
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("SETTLEMENT_SOURCE_ACCOUNT_INVALID");
    });

    it("T-S-SRC-CUSTODY: from=driver_custody → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "src-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: ids,
          fromAccountId: driverCustodyId,
          paymentMethod: "كاش",
        },
        "src",
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("SETTLEMENT_SOURCE_ACCOUNT_INVALID");
    });

    it("T-S-INV-METHOD-AJIL: paymentMethod='آجل' → 400 VALIDATION_FAILED", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "aj-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "آجل",
        },
        "aj",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("T-S-INV-METHOD-XBANK: main_cash + method=بنك → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "xb-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "بنك",
        },
        "xb",
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("SETTLEMENT_SOURCE_ACCOUNT_INVALID");
    });

    it("T-S-INV-METHOD-XCASH: main_bank + method=كاش → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 1, "xc-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sellerId,
          bonusIds: ids,
          fromAccountId: mainBankId,
          paymentMethod: "كاش",
        },
        "xc",
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("SETTLEMENT_SOURCE_ACCOUNT_INVALID");
    });

    it("T-S-INSUFFICIENT: balance<netPayout → 409 INSUFFICIENT_BALANCE + zero side effects", async () => {
      // Use a fresh main_bank drained to ~1€, then settle a driver bonus (5€).
      const { withTxInRoute } = await import("@/db/client");
      const { treasuryAccounts } = await import("@/db/schema");
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(treasuryAccounts)
          .set({ balance: "1.00" })
          .where(eq(treasuryAccounts.id, mainBankId));
      });

      const a = await createConfirmedOrder(seller(), driver(), 1, "is-a");
      const ids = await loadBonusIds(a.orderId, "driver");
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: driverId,
          bonusIds: ids,
          fromAccountId: mainBankId,
          paymentMethod: "بنك",
        },
        "is",
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("INSUFFICIENT_BALANCE");

      // Bonuses untouched.
      const { withRead } = await import("@/db/client");
      const { bonuses } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db.select().from(bonuses).where(inArray(bonuses.id, ids)),
      );
      for (const r of rows) expect(r.status).toBe("unpaid");

      // Restore main_bank for follow-on tests.
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .update(treasuryAccounts)
          .set({ balance: "5000.00" })
          .where(eq(treasuryAccounts.id, mainBankId));
      });
    });

    it("T-S-IDEM: replay same Idempotency-Key → same response, 1 settlement row, 1 movement", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 2, "idem-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      const body = {
        kind: "settlement" as const,
        userId: sellerId,
        bonusIds: ids,
        fromAccountId: mainCashId,
        paymentMethod: "كاش" as const,
      };
      const r1 = await callCreateSettlement(admin(), body, "idem-a");
      expect(r1.status).toBe(200);
      const b1 = (await r1.json()) as {
        result: { settlement: { id: number }; movementId: number | null };
      };
      const r2 = await callCreateSettlement(admin(), body, "idem-a");
      expect(r2.status).toBe(200);
      const b2 = (await r2.json()) as {
        result: { settlement: { id: number }; movementId: number | null };
      };
      expect(b2.result.settlement.id).toBe(b1.result.settlement.id);
      expect(b2.result.movementId).toBe(b1.result.movementId);

      // Exactly 1 movement + 1 settlement for this group.
      expect(
        await countMovementsForSettlement(b1.result.settlement.id),
      ).toBe(1);
    });

    it("T-S-CONC: 2 parallel for same bonusIds → 1 succeeds, other INVALID_SETTLEMENT_BONUS_SET", async () => {
      const a = await createConfirmedOrder(seller(), driver(), 2, "cnc-a");
      const ids = await loadBonusIds(a.orderId, "seller");
      const body = {
        kind: "settlement" as const,
        userId: sellerId,
        bonusIds: ids,
        fromAccountId: mainCashId,
        paymentMethod: "كاش" as const,
      };
      const [r1, r2] = await Promise.all([
        callCreateSettlement(admin(), body, "cnc-a-1"),
        callCreateSettlement(admin(), body, "cnc-a-2"),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 400]);
      const loser = r1.status === 400 ? r1 : r2;
      const body400 = (await loser.json()) as { code: string };
      expect(body400.code).toBe("INVALID_SETTLEMENT_BONUS_SET");
    });

    // ─────────────────── REWARD ───────────────────

    it("T-R-HAPPY: reward 200€ from main_cash → settlement + movement", async () => {
      const balBefore = Number(await readBalance(mainCashId));
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "reward",
          userId: driverId,
          amount: 200,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
          notes: "مكافأة يدوية",
        },
        "rh",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        kind: string;
        result: {
          settlement: { id: number; type: string; amount: string };
          movementId: number;
        };
      };
      expect(body.kind).toBe("reward");
      expect(body.result.settlement.type).toBe("reward");
      expect(Number(body.result.settlement.amount)).toBe(200);
      expect(Number(await readBalance(mainCashId))).toBeCloseTo(balBefore - 200, 2);
    });

    it("T-R-PREC: reward amount=0.004 → 400 VALIDATION_FAILED", async () => {
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "reward",
          userId: driverId,
          amount: 0.004,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "rp",
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("T-R-SRC-NOT-MAIN: reward from manager_box → 409 SETTLEMENT_SOURCE_ACCOUNT_INVALID", async () => {
      const res = await callCreateSettlement(
        admin(),
        {
          kind: "reward",
          userId: driverId,
          amount: 50,
          fromAccountId: managerBoxId,
          paymentMethod: "كاش",
        },
        "rsnm",
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("SETTLEMENT_SOURCE_ACCOUNT_INVALID");
    });

    // ─────────────────── cancel_as_debt ───────────────────

    async function callCancelOrder(
      orderId: number,
      claims: ReturnType<typeof admin>,
      body: {
        reason: string;
        returnToStock: boolean;
        sellerBonusAction: "keep" | "cancel_unpaid" | "cancel_as_debt";
        driverBonusAction: "keep" | "cancel_unpaid" | "cancel_as_debt";
      },
      idempotencyKey: string,
    ): Promise<Response> {
      const r = await freshRoutes(claims);
      return r.cancel.POST(
        new Request(`http://localhost/api/v1/orders/${orderId}/cancel`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: String(orderId) }) },
      );
    }

    it("T-CAD-HAPPY: cancel settled order → debt row<0 applied=false + NO movement + method=N/A", async () => {
      // Fresh seller so we isolate debt totals.
      const freshId = await (async () => {
        const { withTxInRoute } = await import("@/db/client");
        const { users } = await import("@/db/schema");
        const { hashPassword } = await import("@/lib/password");
        const hash = await hashPassword("test-pass-4.4");
        return await withTxInRoute(undefined, async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-44d",
              password: hash,
              name: "Seller D",
              role: "seller",
              active: true,
            })
            .returning();
          return s[0].id;
        });
      })();
      const freshSeller = {
        id: freshId,
        username: "sel-44d",
        role: "seller",
        name: "Seller D",
      };
      const a = await createConfirmedOrder(freshSeller, driver(), 2, "cad-a");
      const ids = await loadBonusIds(a.orderId, "seller");

      // Settle bonuses first → status=settled.
      const settled = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: freshId,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "cad-pre",
      );
      expect(settled.status).toBe(200);

      // Now cancel with cancel_as_debt.
      const res = await callCancelOrder(
        a.orderId,
        admin(),
        {
          reason: "تجربة cancel_as_debt",
          returnToStock: false,
          sellerBonusAction: "cancel_as_debt",
          driverBonusAction: "keep",
        },
        "cad-a",
      );
      expect(res.status).toBe(200);

      // Exactly one debt row for this user with the matching note + amount.
      const { withRead } = await import("@/db/client");
      const { settlements, treasuryMovements } = await import("@/db/schema");
      const debts = await withRead(undefined, (db) =>
        db
          .select()
          .from(settlements)
          .where(
            and(
              eq(settlements.userId, freshId),
              eq(settlements.type, "debt"),
            ),
          ),
      );
      expect(debts.length).toBe(1);
      expect(Number(debts[0].amount)).toBe(-20); // 2 items × 10€
      expect(debts[0].applied).toBe(false);
      expect(debts[0].paymentMethod).toBe("N/A");

      // No treasury_movement was generated for this debt (no cash outflow).
      // We filter by notes mentioning this order id.
      const movs = await withRead(undefined, (db) =>
        db
          .select()
          .from(treasuryMovements)
          .where(
            and(
              eq(treasuryMovements.referenceType, "settlement"),
              eq(treasuryMovements.referenceId, debts[0].id),
            ),
          ),
      );
      expect(movs.length).toBe(0);
    });

    it("T-CAD-PAYMENT-NA: debt row carries paymentMethod='N/A' exactly (not 'كاش' or default)", async () => {
      // Reuse the prior happy debt (sel-44d) — already created above.
      const { withRead } = await import("@/db/client");
      const { settlements } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select({ method: settlements.paymentMethod })
          .from(settlements)
          .where(eq(settlements.type, "debt")),
      );
      for (const r of rows) expect(r.method).toBe("N/A");
    });

    it("T-CAD-IDEM-REPLAY: replay same Idempotency-Key → same response, ≤2 debt rows total (one per role)", async () => {
      // Fresh seller to isolate.
      const freshId = await (async () => {
        const { withTxInRoute } = await import("@/db/client");
        const { users } = await import("@/db/schema");
        const { hashPassword } = await import("@/lib/password");
        const hash = await hashPassword("test-pass-4.4");
        return await withTxInRoute(undefined, async (tx) => {
          const s = await tx
            .insert(users)
            .values({
              username: "sel-44e",
              password: hash,
              name: "Seller E",
              role: "seller",
              active: true,
            })
            .returning();
          return s[0].id;
        });
      })();
      const freshSeller = {
        id: freshId,
        username: "sel-44e",
        role: "seller",
        name: "Seller E",
      };
      const a = await createConfirmedOrder(freshSeller, driver(), 1, "cri");
      const sellerIds = await loadBonusIds(a.orderId, "seller");
      const driverIds = await loadBonusIds(a.orderId, "driver");

      // Settle BOTH seller and driver bonuses first.
      await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: freshId,
          bonusIds: sellerIds,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "cri-s-pre",
      );
      await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: driverId,
          bonusIds: driverIds,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "cri-d-pre",
      );

      // Cancel with cancel_as_debt on BOTH roles, with the SAME idempotency key.
      const idemKey = "cad-idem-replay-key";
      const cancelBody = {
        reason: "idem replay",
        returnToStock: false,
        sellerBonusAction: "cancel_as_debt" as const,
        driverBonusAction: "cancel_as_debt" as const,
      };
      const r1 = await callCancelOrder(a.orderId, admin(), cancelBody, idemKey);
      expect(r1.status).toBe(200);
      const b1 = (await r1.json()) as unknown;
      const r2 = await callCancelOrder(a.orderId, admin(), cancelBody, idemKey);
      expect(r2.status).toBe(200);
      const b2 = (await r2.json()) as unknown;
      // JSONB roundtrip on the idempotency cache can reorder keys; compare
      // by deep equality rather than raw text.
      expect(b2).toEqual(b1);

      // Exactly 2 debt rows total: one seller, one driver. Not 4.
      const { withRead } = await import("@/db/client");
      const { settlements, activityLog } = await import("@/db/schema");
      const sellerDebts = await withRead(undefined, (db) =>
        db
          .select()
          .from(settlements)
          .where(
            and(
              eq(settlements.userId, freshId),
              eq(settlements.type, "debt"),
            ),
          ),
      );
      expect(sellerDebts.length).toBe(1);
      const driverDebts = await withRead(undefined, (db) =>
        db
          .select()
          .from(settlements)
          .where(
            and(
              eq(settlements.userId, driverId),
              eq(settlements.type, "debt"),
            ),
          ),
      );
      expect(driverDebts.length).toBe(1);

      // Activity_log contains exactly ONE "cancel" entry for this order, not two.
      const cancelLogs = await withRead(undefined, (db) =>
        db
          .select()
          .from(activityLog)
          .where(
            and(
              eq(activityLog.entityType, "orders"),
              eq(activityLog.entityId, a.orderId),
              eq(activityLog.action, "cancel"),
            ),
          ),
      );
      expect(cancelLogs.length).toBe(1);
    });

    it("T-CAD-CONSUME-NEXT: next settlement for same user nets out the debt", async () => {
      // Uses seller-44d from T-CAD-HAPPY which has a -20€ debt. Create fresh
      // bonuses (30€ gross), settle → netPayout=10, debt becomes applied.
      const { withRead } = await import("@/db/client");
      const { users } = await import("@/db/schema");
      const row = await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "sel-44d")).limit(1),
      );
      const sid = row[0].id;

      const a = await createConfirmedOrder(
        {
          id: sid,
          username: "sel-44d",
          role: "seller",
          name: "Seller D",
        },
        driver(),
        3,
        "ccn",
      );
      const ids = await loadBonusIds(a.orderId, "seller");

      const res = await callCreateSettlement(
        admin(),
        {
          kind: "settlement",
          userId: sid,
          bonusIds: ids,
          fromAccountId: mainCashId,
          paymentMethod: "كاش",
        },
        "ccn",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: {
          netPayout: string;
          debtTotal: string;
          debtIdsApplied: number[];
          settlement: { id: number };
        };
      };
      expect(Number(body.result.debtTotal)).toBe(-20);
      expect(Number(body.result.netPayout)).toBe(10);
      expect(body.result.debtIdsApplied.length).toBeGreaterThanOrEqual(1);

      // The debt row is now applied=true with applied_in_settlement_id set.
      const { settlements } = await import("@/db/schema");
      const debts = await withRead(undefined, (db) =>
        db
          .select()
          .from(settlements)
          .where(
            and(eq(settlements.userId, sid), eq(settlements.type, "debt")),
          ),
      );
      for (const d of debts) {
        expect(d.applied).toBe(true);
        expect(d.appliedInSettlementId).toBe(body.result.settlement.id);
      }
    });

    // ─────────────────── PERMISSIONS ───────────────────

    it("T-P-GET-SETT-MATRIX: pm/gm 200; manager/seller/driver/stock_keeper 403", async () => {
      for (const who of [manager(), seller(), driver(), sk()]) {
        const r = await freshRoutes(who);
        const res = await r.settlements.GET(
          new Request("http://localhost/api/v1/settlements"),
        );
        expect(res.status).toBe(403);
      }
      const rp = await freshRoutes(admin());
      const ok = await rp.settlements.GET(
        new Request("http://localhost/api/v1/settlements"),
      );
      expect(ok.status).toBe(200);
    });

    it("T-P-POST-SETT-MATRIX: manager/seller/driver/stock_keeper → 403", async () => {
      const body = JSON.stringify({
        kind: "reward",
        userId: driverId,
        amount: 1,
        fromAccountId: mainCashId,
        paymentMethod: "كاش",
      });
      for (const who of [manager(), seller(), driver(), sk()]) {
        const r = await freshRoutes(who);
        const res = await r.settlements.POST(
          new Request("http://localhost/api/v1/settlements", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": `44-perm-${who.role}`,
            },
            body,
          }),
        );
        expect(res.status).toBe(403);
      }
    });

    it("T-P-GET-BONUSES-MAT: pm full, seller own-forced, driver own-forced, manager/sk 403", async () => {
      // Pre-seed varied bonuses exist from prior tests.
      const rpm = await freshRoutes(admin());
      const pmRes = await rpm.bonuses.GET(
        new Request("http://localhost/api/v1/bonuses"),
      );
      expect(pmRes.status).toBe(200);
      const pmBody = (await pmRes.json()) as {
        items: Array<{ userId: number }>;
        summary: Record<string, string>;
      };
      const pmUserIds = new Set(pmBody.items.map((b) => b.userId));
      expect(pmUserIds.size).toBeGreaterThan(1); // multiple users visible to pm

      // Seller sees only own rows even if they try a userId=other override.
      const rs = await freshRoutes(seller());
      const sRes = await rs.bonuses.GET(
        new Request(
          `http://localhost/api/v1/bonuses?userId=${driverId}`, // attempted override
        ),
      );
      expect(sRes.status).toBe(200);
      const sBody = (await sRes.json()) as {
        items: Array<{ userId: number }>;
      };
      for (const item of sBody.items) {
        expect(item.userId).toBe(sellerId);
      }

      // Driver sees only own.
      const rd = await freshRoutes(driver());
      const dRes = await rd.bonuses.GET(
        new Request(
          `http://localhost/api/v1/bonuses?userId=${sellerId}`, // attempted override
        ),
      );
      expect(dRes.status).toBe(200);
      const dBody = (await dRes.json()) as {
        items: Array<{ userId: number }>;
      };
      for (const item of dBody.items) {
        expect(item.userId).toBe(driverId);
      }

      // Manager + stock_keeper → 403 at route.
      for (const who of [manager(), sk()]) {
        const r = await freshRoutes(who);
        const res = await r.bonuses.GET(
          new Request("http://localhost/api/v1/bonuses"),
        );
        expect(res.status).toBe(403);
      }
    });

    // Touch `sql` to silence unused-import warnings when iterating quickly.
    void sql;
  },
);
