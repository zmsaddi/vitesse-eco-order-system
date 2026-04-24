import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "../integration/setup";

// P-audit-1 — Real regression pack, file 2/3.
//
// Covers the order → delivery → invoice → treasury → snapshot chain plus
// the idempotency invariant on POST /api/v1/orders. Tests are sequential
// and share state across the file — failing any early one short-circuits
// the later ones. Per the D-78 §2 "permanent critical flows" intent.

function todayParisIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Baseline D-35 + operational settings so confirm-delivery can auto-issue
// the invoice (D-35 gate) and bonuses compute without throwing.
const D35_BASELINE: Array<{ key: string; value: string }> = [
  { key: "shop_name", value: "VITESSE ECO SAS" },
  { key: "shop_legal_form", value: "SAS" },
  { key: "shop_siret", value: "12345678901234" },
  { key: "shop_siren", value: "123456789" },
  { key: "shop_ape", value: "4618Z" },
  { key: "shop_vat_number", value: "FR12345678901" },
  { key: "shop_address", value: "123 Rue de la Paix" },
  { key: "shop_city", value: "86000 Poitiers, France" },
  { key: "shop_iban", value: "FR7610057190010000000000001" },
  { key: "shop_bic", value: "CMBRFR2BARK" },
  { key: "shop_capital_social", value: "10000" },
  { key: "shop_rcs_city", value: "Poitiers" },
  { key: "shop_rcs_number", value: "RCS Poitiers 123 456 789" },
  { key: "shop_penalty_rate_annual", value: "10.5" },
  { key: "shop_recovery_fee_eur", value: "40" },
  { key: "vat_rate", value: "20" },
  { key: "max_discount_seller_pct", value: "5" },
  { key: "seller_bonus_fixed", value: "0" },
  { key: "seller_bonus_percentage", value: "0" },
  { key: "driver_bonus_fixed", value: "0" },
  { key: "driver_custody_cap_eur", value: "2000" },
];

describe.skipIf(!HAS_DB)(
  "P-audit-1 order-to-cash (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let managerId: number;
    let driverId: number;
    let clientId: number;
    let productId: number;
    const mainCashTypeBefore: { balance: string } = { balance: "0" };

    // Shared-state carriers across the sequential `it()` chain.
    let orderId = 0;
    let deliveryId = 0;
    let invoiceId = 0;
    let invoiceTotalTtcFrozen = "";

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
        clients,
        products,
        settings,
        users,
        treasuryAccounts,
      } = await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-audit-1");

      // Manager + driver with manager_box + driver_custody (Phase 4.2 bridge).
      const wired = await withTxInRoute(undefined, (tx) =>
        wireManagerAndDrivers(tx, {
          managerSuffix: "pa1",
          driverSuffixes: ["pa1"],
          passwordHash: hash,
        }),
      );
      managerId = wired.managerId;
      driverId = wired.driverIds[0];

      sellerId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(users)
            .values({
              username: "sel-pa1",
              password: hash,
              name: "Seller PA1",
              role: "seller",
              active: true,
            })
            .returning(),
        )
      )[0].id;

      clientId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(clients)
            .values({
              name: "عميل PA1",
              phone: "+33600000001",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      productId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(products)
            .values({
              name: "منتج PA1",
              category: "cat-pa1",
              buyPrice: "40.00",
              sellPrice: "100.00",
              stock: "10.00",
              lowStockThreshold: 3,
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      // D-35 + operational knobs.
      await withTxInRoute(undefined, async (tx) => {
        for (const s of D35_BASELINE) {
          await tx
            .insert(settings)
            .values(s)
            .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
        }
      });

      // Snapshot main_cash balance before the flow to compare against later.
      const mc = await withRead(undefined, (db) =>
        db
          .select()
          .from(treasuryAccounts)
          .where(eq(treasuryAccounts.type, "main_cash"))
          .limit(1),
      );
      if (mc.length > 0) mainCashTypeBefore.balance = mc[0].balance;
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

    async function fresh(
      module: string,
      user: { id: number; username: string; role: string; name: string },
    ) {
      vi.resetModules();
      const unreadMod = await import("@/lib/unread-count-header");
      unreadMod.resetUnreadCountCacheForTesting();
      mockSession(user);
      return await import(module);
    }

    const admin = () => ({
      id: adminUserId,
      username: "admin",
      role: "pm",
      name: "Admin",
    });
    const seller = () => ({
      id: sellerId,
      username: "sel-pa1",
      role: "seller",
      name: "Seller",
    });
    const driver = () => ({
      id: driverId,
      username: "drv-pa1",
      role: "driver",
      name: "Driver",
    });

    // ─────────────────── Flows 02 + 07: orders + idempotency ───────────────────

    it("T-PA1-ORDERS-01: POST /api/v1/orders → 201 with refCode + id", async () => {
      const mod = await fresh("@/app/api/v1/orders/route", seller());
      const body = JSON.stringify({
        clientId,
        date: todayParisIso(),
        paymentMethod: "كاش",
        items: [{ productId, quantity: 1, unitPrice: 100 }],
      });
      const res = await mod.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "pa1-create-1",
          },
          body,
        }),
      );
      expect(res.status).toBe(201);
      const j = (await res.json()) as { order: { id: number; refCode: string } };
      expect(j.order.id).toBeGreaterThan(0);
      expect(j.order.refCode).toMatch(/^ORD-/);
      orderId = j.order.id;
    });

    it("T-PA1-ORDERS-02: GET /api/v1/orders/[id] → detail returns the created order", async () => {
      // No GET list endpoint at /api/v1/orders in the current codebase; the
      // canonical existence check is the per-id detail endpoint. Implementation
      // amendment vs contract §0 plan — documented in the delivery report §12.
      const mod = await fresh("@/app/api/v1/orders/[id]/route", admin());
      const res = await mod.GET(
        new Request(`http://localhost/api/v1/orders/${orderId}`),
        { params: Promise.resolve({ id: String(orderId) }) },
      );
      expect(res.status).toBe(200);
      const j = (await res.json()) as { order: { id: number; refCode: string } };
      expect(j.order.id).toBe(orderId);
      expect(j.order.refCode).toMatch(/^ORD-/);
    });

    it("T-PA1-IDEMP-01: same POST body + same Idempotency-Key → same id, DB has 1 row", async () => {
      const mod = await fresh("@/app/api/v1/orders/route", seller());
      const body = JSON.stringify({
        clientId,
        date: todayParisIso(),
        paymentMethod: "كاش",
        items: [{ productId, quantity: 1, unitPrice: 100 }],
      });
      const res = await mod.POST(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "pa1-create-1",
          },
          body,
        }),
      );
      expect([200, 201]).toContain(res.status);
      const j = (await res.json()) as { order: { id: number } };
      expect(j.order.id).toBe(orderId);

      // Confirm DB has exactly one orders row matching this refCode.
      const { withRead } = await import("@/db/client");
      const { orders } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)),
      );
      expect(rows.length).toBe(1);
    });

    // ─────────────────── Flow 03 — delivery create → start → confirm ───────────────────

    it("T-PA1-DEL-01: state transitions جاهز → delivery create/start/confirm all 2xx", async () => {
      // Step A — admin transitions order to قيد التحضير then جاهز
      const startPrepMod = await fresh(
        "@/app/api/v1/orders/[id]/start-preparation/route",
        admin(),
      );
      const sp = await startPrepMod.POST(
        new Request(`http://localhost/api/v1/orders/${orderId}/start-preparation`, {
          method: "POST",
          headers: { "Idempotency-Key": `pa1-sp-${orderId}` },
        }),
        { params: Promise.resolve({ id: String(orderId) }) },
      );
      expect(sp.status).toBe(200);

      const markReadyMod = await fresh(
        "@/app/api/v1/orders/[id]/mark-ready/route",
        admin(),
      );
      const mr = await markReadyMod.POST(
        new Request(`http://localhost/api/v1/orders/${orderId}/mark-ready`, {
          method: "POST",
          headers: { "Idempotency-Key": `pa1-mr-${orderId}` },
        }),
        { params: Promise.resolve({ id: String(orderId) }) },
      );
      expect(mr.status).toBe(200);

      // Step B — create delivery
      const delMod = await fresh("@/app/api/v1/deliveries/route", admin());
      const delRes = await delMod.POST(
        new Request("http://localhost/api/v1/deliveries", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `pa1-del-${orderId}`,
          },
          body: JSON.stringify({ orderId, assignedDriverId: driverId, notes: "" }),
        }),
      );
      expect(delRes.status).toBe(201);
      const delJson = (await delRes.json()) as { delivery: { id: number } };
      deliveryId = delJson.delivery.id;

      // Step C — start delivery (driver)
      const startDelMod = await fresh(
        "@/app/api/v1/deliveries/[id]/start/route",
        driver(),
      );
      const sd = await startDelMod.POST(
        new Request(`http://localhost/api/v1/deliveries/${deliveryId}/start`, {
          method: "POST",
          headers: { "Idempotency-Key": `pa1-ds-${deliveryId}` },
        }),
        { params: Promise.resolve({ id: String(deliveryId) }) },
      );
      expect(sd.status).toBe(200);

      // Step D — confirm delivery with full payment
      const confirmMod = await fresh(
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route",
        driver(),
      );
      const cd = await confirmMod.POST(
        new Request(
          `http://localhost/api/v1/deliveries/${deliveryId}/confirm-delivery`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `pa1-cd-${deliveryId}`,
            },
            body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
          },
        ),
        { params: Promise.resolve({ id: String(deliveryId) }) },
      );
      expect(cd.status).toBe(200);
    });

    // ─────────────────── Flow 04 — invoice auto-created ───────────────────

    it("T-PA1-INV-01: GET /api/v1/invoices → auto-issued invoice for this order", async () => {
      const mod = await fresh("@/app/api/v1/invoices/route", admin());
      const res = await mod.GET(
        new Request("http://localhost/api/v1/invoices?limit=50"),
      );
      expect(res.status).toBe(200);
      const j = (await res.json()) as {
        invoices: Array<{ id: number; orderId: number; totalTtcFrozen: string }>;
      };
      const found = j.invoices.find((inv) => inv.orderId === orderId);
      expect(found, `invoice for order ${orderId} must exist after confirm`).toBeDefined();
      invoiceId = found!.id;
      invoiceTotalTtcFrozen = found!.totalTtcFrozen;
      expect(Number(invoiceTotalTtcFrozen)).toBeCloseTo(100, 2);
    });

    it("T-PA1-INV-02: GET /api/v1/invoices/[id] → detail returns {invoice, lines, avoirParent}", async () => {
      const mod = await fresh("@/app/api/v1/invoices/[id]/route", admin());
      const res = await mod.GET(
        new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
        { params: Promise.resolve({ id: String(invoiceId) }) },
      );
      expect(res.status).toBe(200);
      const j = (await res.json()) as {
        invoice: { id: number; orderId: number };
        lines: unknown[];
        avoirParent: unknown;
      };
      expect(j.invoice.id).toBe(invoiceId);
      expect(j.invoice.orderId).toBe(orderId);
      expect(Array.isArray(j.lines)).toBe(true);
    });

    // ─────────────────── Flow 05 — treasury ───────────────────

    it("T-PA1-TR-01: treasury_movements has a row with referenceType='order' + referenceId=orderId", async () => {
      const { withRead } = await import("@/db/client");
      const { treasuryMovements } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
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
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it("T-PA1-TR-02: driver_custody balance reflects the 100€ collection", async () => {
      const { withRead } = await import("@/db/client");
      const { treasuryAccounts } = await import("@/db/schema");
      const rows = await withRead(undefined, (db) =>
        db
          .select()
          .from(treasuryAccounts)
          .where(
            and(
              eq(treasuryAccounts.type, "driver_custody"),
              eq(treasuryAccounts.ownerUserId, driverId),
            ),
          ),
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].balance)).toBeCloseTo(100, 2);
      void managerId;
      void mainCashTypeBefore;
    });

    // ─────────────────── Flow 08 — snapshots (frozen + immutable) ───────────────────

    it("T-PA1-SNAP-01: invoice detail carries frozen fields (D-37)", async () => {
      const mod = await fresh("@/app/api/v1/invoices/[id]/route", admin());
      const res = await mod.GET(
        new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
        { params: Promise.resolve({ id: String(invoiceId) }) },
      );
      const j = (await res.json()) as {
        invoice: {
          clientNameFrozen: string;
          totalTtcFrozen: string;
          vendorSnapshot: Record<string, unknown>;
        };
      };
      expect(j.invoice.clientNameFrozen).toBe("عميل PA1");
      expect(Number(j.invoice.totalTtcFrozen)).toBeCloseTo(100, 2);
      expect(j.invoice.vendorSnapshot).toBeTypeOf("object");
      expect(Object.keys(j.invoice.vendorSnapshot).length).toBeGreaterThan(0);
    });

    it("T-PA1-SNAP-02: mutating products.sellPrice leaves invoice.totalTtcFrozen unchanged", async () => {
      const { withRead, withTxInRoute } = await import("@/db/client");
      const { products } = await import("@/db/schema");

      await withTxInRoute(undefined, (tx) =>
        tx
          .update(products)
          .set({ sellPrice: "999.99" })
          .where(eq(products.id, productId)),
      );

      // Verify source mutated
      const updated = await withRead(undefined, (db) =>
        db.select().from(products).where(eq(products.id, productId)).limit(1),
      );
      expect(updated[0].sellPrice).toBe("999.99");

      // Re-fetch invoice — totalTtcFrozen must be byte-identical to the
      // value we captured right after auto-issuance.
      const mod = await fresh("@/app/api/v1/invoices/[id]/route", admin());
      const res = await mod.GET(
        new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
        { params: Promise.resolve({ id: String(invoiceId) }) },
      );
      const j = (await res.json()) as { invoice: { totalTtcFrozen: string } };
      expect(j.invoice.totalTtcFrozen).toBe(invoiceTotalTtcFrozen);
    });
  },
);
