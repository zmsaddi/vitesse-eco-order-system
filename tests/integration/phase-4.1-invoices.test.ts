import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 4.1 — invoice core.
//
// Covers the tranche acceptance criteria verbatim:
//   1. Happy path: confirm-delivery → invoice + invoice_lines + PDF endpoint
//   2. Missing D-35 settings → 412 + no side effects
//   3. Idempotency replay → 1 invoice only
//   4. Cross-day: orders.delivery_date ≡ invoice.deliveryDate (confirm moment)
//   5. Frozen snapshot: mutating client/product after issue doesn't change
//      what the invoice returns.

function todayParisIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Baseline D-35 settings — used by all happy-path suites. The "missing D-35"
// suite overrides one key with "TO_FILL" to force the gate to reject.
const D35_GOOD: Array<{ key: string; value: string }> = [
  { key: "shop_name", value: "VITESSE ECO SAS" },
  { key: "shop_legal_form", value: "SAS" },
  { key: "shop_siret", value: "12345678901234" },
  { key: "shop_siren", value: "123456789" },
  { key: "shop_ape", value: "4618Z" },
  { key: "shop_vat_number", value: "FR12345678901" },
  { key: "shop_address", value: "123 Rue de la Paix" },
  { key: "shop_city", value: "86000 Poitiers, France" },
  { key: "shop_email", value: "contact@vitesse-eco.fr" },
  { key: "shop_website", value: "www.vitesse-eco.fr" },
  { key: "shop_iban", value: "FR7610057190010000000000001" },
  { key: "shop_bic", value: "CMBRFR2BARK" },
  { key: "shop_capital_social", value: "10000" },
  { key: "shop_rcs_city", value: "Poitiers" },
  { key: "shop_rcs_number", value: "RCS Poitiers 123 456 789" },
  { key: "shop_penalty_rate_annual", value: "10.5" },
  { key: "shop_recovery_fee_eur", value: "40" },
  { key: "vat_rate", value: "20" },
  // Operational knobs (needed by createOrder + bonuses):
  { key: "max_discount_seller_pct", value: "5" },
  { key: "seller_bonus_fixed", value: "0" },
  { key: "seller_bonus_percentage", value: "0" },
  { key: "driver_bonus_fixed", value: "0" },
];

describe.skipIf(!HAS_DB)("Phase 4.1 invoice core (requires TEST_DATABASE_URL)", () => {
  let adminUserId: number;
  let sellerId: number;
  let sellerOtherId: number;
  let driverId: number;
  let driverOtherId: number;
  let stockKeeperId: number;
  let clientId: number;
  let productId: number;

  async function seedAllSettings(tx: unknown, pairs: Array<{ key: string; value: string }>) {
    const { settings } = await import("@/db/schema");
    const t = tx as {
      insert: (t: typeof settings) => {
        values: (v: unknown) => {
          onConflictDoUpdate: (args: { target: unknown; set: unknown }) => Promise<unknown>;
        };
      };
    };
    for (const s of pairs) {
      await t
        .insert(settings)
        .values(s)
        .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
    }
  }

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
      productCommissionRules,
    } = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");

    adminUserId = (
      await withRead(undefined, (db) =>
        db.select().from(users).where(eq(users.username, "admin")).limit(1),
      )
    )[0].id;

    const hash = await hashPassword("test-pass-4.1");
    [sellerId, sellerOtherId, driverId, driverOtherId, stockKeeperId] = await withTxInRoute(
      undefined,
      async (tx) => {
        const s1 = await tx
          .insert(users)
          .values({ username: "sel-41", password: hash, name: "Seller 41", role: "seller", active: true })
          .returning();
        const s2 = await tx
          .insert(users)
          .values({ username: "sel-41b", password: hash, name: "Seller 41b", role: "seller", active: true })
          .returning();
        const sk = await tx
          .insert(users)
          .values({ username: "sk-41", password: hash, name: "SK 41", role: "stock_keeper", active: true })
          .returning();
        const wired = await wireManagerAndDrivers(tx, {
          managerSuffix: "p41",
          driverSuffixes: ["41", "41b"],
          passwordHash: hash,
        });
        return [s1[0].id, s2[0].id, wired.driverIds[0], wired.driverIds[1], sk[0].id];
      },
    );

    clientId = (
      await withTxInRoute(undefined, async (tx) =>
        tx
          .insert(clients)
          .values({
            name: "Société ABC",
            phone: "+33600410001",
            email: "abc@example.fr",
            address: "10 Avenue du Général, 75000 Paris",
            createdBy: "admin",
          })
          .returning(),
      )
    )[0].id;

    productId = await withTxInRoute(undefined, async (tx) => {
      const p = await tx
        .insert(products)
        .values({
          name: "Produit 41",
          category: "cat-41",
          buyPrice: "40.00",
          sellPrice: "100.00",
          stock: "100.00",
          createdBy: "admin",
        })
        .returning();
      await seedAllSettings(tx, D35_GOOD);
      await tx
        .insert(productCommissionRules)
        .values({
          category: "cat-41",
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
      invoicesList: await import("@/app/api/v1/invoices/route"),
      invoicesDetail: await import("@/app/api/v1/invoices/[id]/route"),
      invoicesPdf: await import("@/app/api/v1/invoices/[id]/pdf/route"),
    };
  }

  const admin = () => ({ id: adminUserId, username: "admin", role: "pm", name: "Admin" });
  const seller = () => ({ id: sellerId, username: "sel-41", role: "seller", name: "Seller" });
  const sellerOther = () => ({
    id: sellerOtherId,
    username: "sel-41b",
    role: "seller",
    name: "Seller Other",
  });
  const driver = () => ({ id: driverId, username: "drv-41", role: "driver", name: "Driver" });
  const driverOther = () => ({
    id: driverOtherId,
    username: "drv-41b",
    role: "driver",
    name: "Driver Other",
  });
  const stockKeeper = () => ({
    id: stockKeeperId,
    username: "sk-41",
    role: "stock_keeper",
    name: "SK",
  });

  async function createReadyOrder(
    creator: { id: number; username: string; role: string; name: string },
    items: Array<{ productId: number; quantity: number; unitPrice: number; isGift?: boolean }>,
    opts: { date?: string; idemSuffix?: string } = {},
  ): Promise<{ orderId: number }> {
    const rc = await freshRoutes(creator);
    const create = await rc.orders.POST(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: opts.date ?? "2026-04-20",
          items,
        }),
      }),
    );
    expect(create.status).toBe(201);
    const { order } = (await create.json()) as { order: { id: number } };

    const rsp = await freshRoutes(admin());
    const spRes = await rsp.startPrep.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
        method: "POST",
        headers: { "Idempotency-Key": `41-sp-${order.id}-${opts.idemSuffix ?? "x"}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(spRes.status).toBe(200);
    const rmr = await freshRoutes(admin());
    const mrRes = await rmr.markReady.POST(
      new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
        method: "POST",
        headers: { "Idempotency-Key": `41-mr-${order.id}-${opts.idemSuffix ?? "x"}` },
      }),
      { params: Promise.resolve({ id: String(order.id) }) },
    );
    expect(mrRes.status).toBe(200);
    return { orderId: order.id };
  }

  async function createAndStartDelivery(
    orderId: number,
    driverClaimsForStart = driver(),
    idemSuffix = "x",
  ): Promise<{ deliveryId: number }> {
    const rcd = await freshRoutes(admin());
    const cd = await rcd.deliveries.POST(
      new Request("http://localhost/api/v1/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, assignedDriverId: driverClaimsForStart.id }),
      }),
    );
    expect(cd.status).toBe(201);
    const { delivery } = (await cd.json()) as { delivery: { id: number } };

    const rs = await freshRoutes(driverClaimsForStart);
    const startRes = await rs.deliveriesStart.POST(
      new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
        method: "POST",
        headers: { "Idempotency-Key": `41-start-${delivery.id}-${idemSuffix}` },
      }),
      { params: Promise.resolve({ id: String(delivery.id) }) },
    );
    expect(startRes.status).toBe(200);
    return { deliveryId: delivery.id };
  }

  async function confirm(
    deliveryId: number,
    claims: { id: number; username: string; role: string; name: string },
    body: { paidAmount: number; paymentMethod?: string },
    idemSuffix: string,
  ): Promise<Response> {
    const r = await freshRoutes(claims);
    return r.deliveriesConfirm.POST(
      new Request(`http://localhost/api/v1/deliveries/${deliveryId}/confirm-delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `41-confirm-${deliveryId}-${idemSuffix}`,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(deliveryId) }) },
    );
  }

  // ────────────── 1. Happy path ──────────────

  it("happy path: confirm-delivery → response includes invoiceId; invoice + lines + PDF all reachable", async () => {
    const { orderId } = await createReadyOrder(
      seller(),
      [{ productId, quantity: 2, unitPrice: 120 }],
      { idemSuffix: "hp" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "hp");
    const confirmRes = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 240, paymentMethod: "كاش" },
      "hp",
    );
    expect(confirmRes.status).toBe(200);
    const body = (await confirmRes.json()) as {
      delivery: { status: string };
      invoiceId: number;
    };
    expect(body.delivery.status).toBe("تم التوصيل");
    expect(typeof body.invoiceId).toBe("number");
    expect(body.invoiceId).toBeGreaterThan(0);

    // GET /api/v1/invoices/[id] as admin.
    const rDetail = await freshRoutes(admin());
    const detailRes = await rDetail.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${body.invoiceId}`),
      { params: Promise.resolve({ id: String(body.invoiceId) }) },
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      invoice: {
        refCode: string;
        date: string;
        deliveryDate: string;
        clientNameFrozen: string;
        sellerNameFrozen: string;
        driverNameFrozen: string;
        paymentMethod: string;
        totalTtcFrozen: string;
        totalHtFrozen: string;
        tvaAmountFrozen: string;
        vatRateFrozen: string;
        status: string;
      };
      lines: Array<{
        productNameFrozen: string;
        quantity: string;
        lineTotalTtcFrozen: string;
        htAmountFrozen: string;
        vatAmountFrozen: string;
        vatRateFrozen: string;
        isGift: boolean;
      }>;
    };
    expect(detail.invoice.refCode).toMatch(/^FAC-\d{4}-\d{2}-\d{4}$/);
    expect(detail.invoice.date).toBe(todayParisIso());
    expect(detail.invoice.deliveryDate).toBe(todayParisIso());
    expect(detail.invoice.clientNameFrozen).toBe("Société ABC");
    expect(detail.invoice.sellerNameFrozen).toBe("Seller 41");
    expect(detail.invoice.driverNameFrozen).toBe("Driver 41");
    expect(detail.invoice.paymentMethod).toBe("كاش");
    expect(Number(detail.invoice.totalTtcFrozen)).toBe(240);
    expect(Number(detail.invoice.vatRateFrozen)).toBe(20);
    // HT + TVA ≈ TTC
    expect(
      Math.abs(
        Number(detail.invoice.totalHtFrozen) +
          Number(detail.invoice.tvaAmountFrozen) -
          240,
      ),
    ).toBeLessThan(0.02);
    expect(detail.invoice.status).toBe("مؤكد");
    expect(detail.lines.length).toBe(1);
    expect(detail.lines[0].productNameFrozen).toBe("Produit 41");
    expect(Number(detail.lines[0].lineTotalTtcFrozen)).toBe(240);

    // PDF endpoint.
    const rPdf = await freshRoutes(admin());
    const pdfRes = await rPdf.invoicesPdf.GET(
      new Request(`http://localhost/api/v1/invoices/${body.invoiceId}/pdf`),
      { params: Promise.resolve({ id: String(body.invoiceId) }) },
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    // PDF magic bytes.
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("happy path: gifts are preserved as invoice lines with 0€", async () => {
    // Gift requires gift_pool to have stock.
    const { withTxInRoute } = await import("@/db/client");
    const { giftPool, products } = await import("@/db/schema");
    const giftProductId = await withTxInRoute(undefined, async (tx) => {
      const gp = await tx
        .insert(products)
        .values({
          name: "Cadeau 41",
          category: "cat-41",
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
      seller(),
      [
        { productId, quantity: 1, unitPrice: 100 },
        { productId: giftProductId, quantity: 1, unitPrice: 0, isGift: true },
      ],
      { idemSuffix: "gift" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "gift");
    const confirmRes = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "gift",
    );
    expect(confirmRes.status).toBe(200);
    const body = (await confirmRes.json()) as { invoiceId: number };

    const rDetail = await freshRoutes(admin());
    const detailRes = await rDetail.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${body.invoiceId}`),
      { params: Promise.resolve({ id: String(body.invoiceId) }) },
    );
    const detail = (await detailRes.json()) as {
      invoice: { totalTtcFrozen: string };
      lines: Array<{ isGift: boolean; lineTotalTtcFrozen: string }>;
    };
    expect(detail.lines.length).toBe(2);
    expect(Number(detail.invoice.totalTtcFrozen)).toBe(100);
    const giftLine = detail.lines.find((l) => l.isGift);
    expect(giftLine).toBeDefined();
    expect(Number(giftLine!.lineTotalTtcFrozen)).toBe(0);
  });

  // ────────────── 2. Missing D-35 → 412 + no side effects ──────────────

  it("D-35 missing: placeholder in shop_siret → 412 D35_READINESS_INCOMPLETE + no side effects", async () => {
    // Stage the order + delivery + start (those don't require D-35).
    const { orderId } = await createReadyOrder(
      seller(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      { idemSuffix: "d35" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "d35");

    // Now corrupt D-35: set siret to the placeholder marker.
    const { withTxInRoute, withRead } = await import("@/db/client");
    const { settings, bonuses, invoices, orders, payments, deliveries, driverTasks } =
      await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(settings)
        .set({ value: "TO_FILL" })
        .where(eq(settings.key, "shop_siret"));
    });

    // Attempt confirm → 412.
    const res = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "d35",
    );
    expect(res.status).toBe(412);
    const errBody = (await res.json()) as { code: string; missing?: string[] };
    expect(errBody.code).toBe("D35_READINESS_INCOMPLETE");

    // Verify NO side effects: delivery still جاري التوصيل, order still جاهز,
    // no payment row, no bonus row, no invoice row, driver_task still
    // in_progress.
    const [deliveryRow] = await withRead(undefined, (db) =>
      db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1),
    );
    expect(deliveryRow.status).toBe("جاري التوصيل");

    const [orderRow] = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(orderRow.status).toBe("جاهز");
    expect(orderRow.deliveryDate).toBeNull();
    expect(orderRow.confirmationDate).toBeNull();

    const pays = await withRead(undefined, (db) =>
      db.select().from(payments).where(eq(payments.orderId, orderId)),
    );
    expect(pays.length).toBe(0);

    const bns = await withRead(undefined, (db) =>
      db.select().from(bonuses).where(eq(bonuses.orderId, orderId)),
    );
    expect(bns.length).toBe(0);

    const invs = await withRead(undefined, (db) =>
      db.select().from(invoices).where(eq(invoices.orderId, orderId)),
    );
    expect(invs.length).toBe(0);

    const tasks = await withRead(undefined, (db) =>
      db
        .select()
        .from(driverTasks)
        .where(
          and(
            eq(driverTasks.relatedEntityType, "delivery"),
            eq(driverTasks.relatedEntityId, deliveryId),
          ),
        ),
    );
    expect(tasks[0].status).toBe("in_progress");

    // Restore for the rest of the suite.
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(settings)
        .set({ value: "12345678901234" })
        .where(eq(settings.key, "shop_siret"));
    });
  });

  // ────────────── 3. Idempotency replay ──────────────

  it("idempotency replay: same key → one invoice only, second response is cache", async () => {
    const { orderId } = await createReadyOrder(
      seller(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      { idemSuffix: "idem" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "idem");
    const r1 = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "idem",
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { invoiceId: number };
    const r2 = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "idem",
    );
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { invoiceId: number };
    expect(b2.invoiceId).toBe(b1.invoiceId);

    const { withRead } = await import("@/db/client");
    const { invoices } = await import("@/db/schema");
    const rows = await withRead(undefined, (db) =>
      db.select().from(invoices).where(eq(invoices.orderId, orderId)),
    );
    expect(rows.length).toBe(1);
  });

  // ────────────── 4. Cross-day accounting + delivery_date ──────────────

  it("cross-day: order dated in the past → invoice.date + invoice.deliveryDate + orders.delivery_date all = today", async () => {
    const today = todayParisIso();
    expect("2026-01-10").not.toBe(today);

    const { orderId } = await createReadyOrder(
      seller(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      { date: "2026-01-10", idemSuffix: "cross" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "cross");
    const res = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "cross",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoiceId: number };

    const { withRead } = await import("@/db/client");
    const { invoices, orders } = await import("@/db/schema");
    const [inv] = await withRead(undefined, (db) =>
      db.select().from(invoices).where(eq(invoices.id, body.invoiceId)).limit(1),
    );
    expect(inv.date).toBe(today);
    expect(inv.deliveryDate).toBe(today);

    const [ord] = await withRead(undefined, (db) =>
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
    );
    expect(ord.deliveryDate).toBe(today);
    // Original submitted date must NOT change.
    expect(ord.date).toBe("2026-01-10");
  });

  // ────────────── 5. Frozen snapshot ──────────────

  it("frozen snapshot: mutating client + product name after issue does not change the invoice", async () => {
    const { orderId } = await createReadyOrder(
      seller(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      { idemSuffix: "fz" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "fz");
    const res = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "fz",
    );
    expect(res.status).toBe(200);
    const { invoiceId } = (await res.json()) as { invoiceId: number };

    // Capture the snapshot now.
    const rBefore = await freshRoutes(admin());
    const beforeRes = await rBefore.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    const before = (await beforeRes.json()) as {
      invoice: { clientNameFrozen: string };
      lines: Array<{ productNameFrozen: string }>;
    };
    expect(before.invoice.clientNameFrozen).toBe("Société ABC");
    expect(before.lines[0].productNameFrozen).toBe("Produit 41");

    // Mutate live rows.
    const { withTxInRoute } = await import("@/db/client");
    const { clients, products } = await import("@/db/schema");
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(clients)
        .set({ name: "Société ABC — renamed" })
        .where(eq(clients.id, clientId));
      await tx
        .update(products)
        .set({ name: "Produit 41 — renamed" })
        .where(eq(products.id, productId));
    });

    // Fetch invoice again — frozen values must not have changed.
    const rAfter = await freshRoutes(admin());
    const afterRes = await rAfter.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    const after = (await afterRes.json()) as {
      invoice: { clientNameFrozen: string };
      lines: Array<{ productNameFrozen: string }>;
    };
    expect(after.invoice.clientNameFrozen).toBe("Société ABC");
    expect(after.lines[0].productNameFrozen).toBe("Produit 41");

    // Restore to not pollute later suites.
    await withTxInRoute(undefined, async (tx) => {
      await tx
        .update(clients)
        .set({ name: "Société ABC" })
        .where(eq(clients.id, clientId));
      await tx
        .update(products)
        .set({ name: "Produit 41" })
        .where(eq(products.id, productId));
    });
  });

  // ────────────── List + permissions ──────────────

  it("GET /invoices: seller sees only own-order invoices", async () => {
    // Create an invoice under the other seller so we have at least one row
    // the first seller must not see.
    const { orderId } = await createReadyOrder(
      sellerOther(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      { idemSuffix: "listB" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "listB");
    await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "listB",
    );

    const r = await freshRoutes(seller());
    const res = await r.invoicesList.GET(new Request("http://localhost/api/v1/invoices"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      invoices: Array<{ sellerNameFrozen: string }>;
      total: number;
    };
    expect(body.invoices.length).toBeGreaterThan(0);
    for (const inv of body.invoices) {
      expect(inv.sellerNameFrozen).toBe("Seller 41");
    }
  });

  it("GET /invoices/[id]: other-driver can't read invoice not assigned to them (403)", async () => {
    const { orderId } = await createReadyOrder(
      seller(),
      [{ productId, quantity: 1, unitPrice: 100 }],
      { idemSuffix: "drvA" },
    );
    const { deliveryId } = await createAndStartDelivery(orderId, driver(), "drvA");
    const res = await confirm(
      deliveryId,
      driver(),
      { paidAmount: 100, paymentMethod: "كاش" },
      "drvA",
    );
    const { invoiceId } = (await res.json()) as { invoiceId: number };

    const r = await freshRoutes(driverOther());
    const dRes = await r.invoicesDetail.GET(
      new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
      { params: Promise.resolve({ id: String(invoiceId) }) },
    );
    expect(dRes.status).toBe(403);
  });

  it("GET /invoices: stock_keeper blocked (403 at route layer)", async () => {
    const r = await freshRoutes(stockKeeper());
    const res = await r.invoicesList.GET(new Request("http://localhost/api/v1/invoices"));
    expect(res.status).toBe(403);
  });
});
