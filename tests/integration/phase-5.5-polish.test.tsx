import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  HAS_DB,
  TEST_DATABASE_URL,
  applyMigrations,
  resetSchema,
  wireManagerAndDrivers,
} from "./setup";

// Phase 5.5 — Polish integration tests.
//
// Scope (per reviewer amendment #5): do NOT claim HTTP page coverage.
// Tests exercise the endpoint the print page consumes
// (GET /api/v1/invoices/[id]) for its role matrix + shape, plus a
// direct component-level smoke that renders `<PrintableInvoice>` with a
// synthetic DTO and asserts the output HTML contains the D-35 mandatory
// mentions. That proves the render code path without pretending to test
// the Next.js server-render pipeline.

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
  "Phase 5.5 — polish (requires TEST_DATABASE_URL)",
  () => {
    let adminUserId: number;
    let sellerId: number;
    let sellerOtherId: number;
    let driverId: number;
    let driverOtherId: number;
    let stockKeeperId: number;
    let clientId: number;
    let productId: number;
    let invoiceId: number;

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
      const { users, clients, products, settings, productCommissionRules } =
        await import("@/db/schema");
      const { hashPassword } = await import("@/lib/password");

      adminUserId = (
        await withRead(undefined, (db) =>
          db.select().from(users).where(eq(users.username, "admin")).limit(1),
        )
      )[0].id;

      const hash = await hashPassword("test-pass-5.5");

      [sellerId, sellerOtherId, stockKeeperId, driverId, driverOtherId] =
        await withTxInRoute(undefined, async (tx) => {
          const s1 = await tx
            .insert(users)
            .values({
              username: "sel-55",
              password: hash,
              name: "Seller 55",
              role: "seller",
              active: true,
            })
            .returning();
          const s2 = await tx
            .insert(users)
            .values({
              username: "sel-55b",
              password: hash,
              name: "Seller 55b",
              role: "seller",
              active: true,
            })
            .returning();
          const sk = await tx
            .insert(users)
            .values({
              username: "sk-55",
              password: hash,
              name: "SK 55",
              role: "stock_keeper",
              active: true,
            })
            .returning();
          const wired = await wireManagerAndDrivers(tx, {
            managerSuffix: "55",
            driverSuffixes: ["55", "55b"],
            passwordHash: hash,
          });
          return [s1[0].id, s2[0].id, sk[0].id, wired.driverIds[0], wired.driverIds[1]];
        });

      clientId = (
        await withTxInRoute(undefined, (tx) =>
          tx
            .insert(clients)
            .values({
              name: "Société 55",
              phone: "+33600550001",
              email: "c55@example.fr",
              address: "5 Rue de la Paix, 75000 Paris",
              createdBy: "admin",
            })
            .returning(),
        )
      )[0].id;

      productId = await withTxInRoute(undefined, async (tx) => {
        const p = await tx
          .insert(products)
          .values({
            name: "Produit 55",
            category: "cat-55",
            buyPrice: "40.00",
            sellPrice: "100.00",
            stock: "100.00",
            createdBy: "admin",
          })
          .returning();
        for (const s of D35_GOOD) {
          await tx
            .insert(settings)
            .values(s)
            .onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
        }
        await tx
          .insert(productCommissionRules)
          .values({
            category: "cat-55",
            sellerFixedPerUnit: "5",
            sellerPctOverage: "0",
            driverFixedPerDelivery: "3",
            active: true,
          })
          .onConflictDoNothing({ target: productCommissionRules.category });
        return p[0].id;
      });

      // Drive an end-to-end order → confirmed delivery → invoice so we
      // have an invoiceId to query from the print perspective.
      type PostNoParams = { POST: (req: Request) => Promise<Response> };
      type PostWithIdParams = {
        POST: (
          req: Request,
          ctx: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      };

      const { POST: ordersPost } = await mockAndImport<PostNoParams>(
        { id: sellerId, username: "sel-55", role: "seller", name: "S55" },
        "@/app/api/v1/orders/route",
      );
      const orderRes = await ordersPost(
        new Request("http://localhost/api/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            date: "2026-04-23",
            items: [{ productId, quantity: 1, unitPrice: 100 }],
          }),
        }),
      );
      const { order } = (await orderRes.json()) as { order: { id: number } };

      const { POST: spPost } = await mockAndImport<PostWithIdParams>(
        { id: adminUserId, username: "admin", role: "pm", name: "A" },
        "@/app/api/v1/orders/[id]/start-preparation/route",
      );
      await spPost(
        new Request(`http://localhost/api/v1/orders/${order.id}/start-preparation`, {
          method: "POST",
          headers: { "Idempotency-Key": `55-sp-${order.id}` },
        }),
        { params: Promise.resolve({ id: String(order.id) }) },
      );

      const { POST: mrPost } = await mockAndImport<PostWithIdParams>(
        { id: adminUserId, username: "admin", role: "pm", name: "A" },
        "@/app/api/v1/orders/[id]/mark-ready/route",
      );
      await mrPost(
        new Request(`http://localhost/api/v1/orders/${order.id}/mark-ready`, {
          method: "POST",
          headers: { "Idempotency-Key": `55-mr-${order.id}` },
        }),
        { params: Promise.resolve({ id: String(order.id) }) },
      );

      const { POST: delPost } = await mockAndImport<PostNoParams>(
        { id: adminUserId, username: "admin", role: "pm", name: "A" },
        "@/app/api/v1/deliveries/route",
      );
      const delRes = await delPost(
        new Request("http://localhost/api/v1/deliveries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: order.id, assignedDriverId: driverId }),
        }),
      );
      const { delivery } = (await delRes.json()) as { delivery: { id: number } };

      const { POST: startPost } = await mockAndImport<PostWithIdParams>(
        { id: driverId, username: "drv-55", role: "driver", name: "D55" },
        "@/app/api/v1/deliveries/[id]/start/route",
      );
      await startPost(
        new Request(`http://localhost/api/v1/deliveries/${delivery.id}/start`, {
          method: "POST",
          headers: { "Idempotency-Key": `55-start-${delivery.id}` },
        }),
        { params: Promise.resolve({ id: String(delivery.id) }) },
      );

      const { POST: confirmPost } = await mockAndImport<PostWithIdParams>(
        { id: driverId, username: "drv-55", role: "driver", name: "D55" },
        "@/app/api/v1/deliveries/[id]/confirm-delivery/route",
      );
      const cfm = await confirmPost(
        new Request(`http://localhost/api/v1/deliveries/${delivery.id}/confirm-delivery`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `55-cfm-${delivery.id}`,
          },
          body: JSON.stringify({ paidAmount: 100, paymentMethod: "كاش" }),
        }),
        { params: Promise.resolve({ id: String(delivery.id) }) },
      );
      const cfmBody = (await cfm.json()) as { invoiceId: number };
      invoiceId = cfmBody.invoiceId;
    });

    async function mockAndImport<T>(
      user: { id: number; username: string; role: string; name: string },
      mod: string,
    ): Promise<T> {
      vi.resetModules();
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
      const unread = await import("@/lib/unread-count-header");
      unread.resetUnreadCountCacheForTesting();
      return (await import(mod)) as T;
    }

    async function getInvoice(user: {
      id: number;
      username: string;
      role: string;
      name: string;
    }): Promise<Response> {
      const mod = await mockAndImport<{
        GET: (
          req: Request,
          ctx: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      }>(user, "@/app/api/v1/invoices/[id]/route");
      return mod.GET(
        new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
        { params: Promise.resolve({ id: String(invoiceId) }) },
      );
    }

    // ───────── Permission matrix on the endpoint the print page consumes ─────────

    it("T-POLISH-PRINT-BACKED-BY-EXISTING-ENDPOINT: pm/gm/manager 200", async () => {
      const pm = await getInvoice({
        id: adminUserId,
        username: "admin",
        role: "pm",
        name: "A",
      });
      const gm = await getInvoice({
        id: adminUserId,
        username: "admin",
        role: "gm",
        name: "A",
      });
      const mgr = await getInvoice({
        id: adminUserId,
        username: "admin",
        role: "manager",
        name: "A",
      });
      expect(pm.status).toBe(200);
      expect(gm.status).toBe(200);
      expect(mgr.status).toBe(200);
    });

    it("T-POLISH-PRINT-SELLER-OWN: creator of the order → 200", async () => {
      const r = await getInvoice({
        id: sellerId,
        username: "sel-55",
        role: "seller",
        name: "S",
      });
      expect(r.status).toBe(200);
    });

    it("T-POLISH-PRINT-SELLER-OTHER: different seller → 403", async () => {
      const r = await getInvoice({
        id: sellerOtherId,
        username: "sel-55b",
        role: "seller",
        name: "S2",
      });
      expect(r.status).toBe(403);
    });

    it("T-POLISH-PRINT-DRIVER-ASSIGNED: the delivery's driver → 200", async () => {
      const r = await getInvoice({
        id: driverId,
        username: "drv-55",
        role: "driver",
        name: "D",
      });
      expect(r.status).toBe(200);
    });

    it("T-POLISH-PRINT-DRIVER-OTHER: other driver → 403", async () => {
      const r = await getInvoice({
        id: driverOtherId,
        username: "drv-55b",
        role: "driver",
        name: "D2",
      });
      expect(r.status).toBe(403);
    });

    it("T-POLISH-PRINT-STOCK-KEEPER-403: stock keeper blocked at route layer", async () => {
      const r = await getInvoice({
        id: stockKeeperId,
        username: "sk-55",
        role: "stock_keeper",
        name: "SK",
      });
      expect(r.status).toBe(403);
    });

    it("T-POLISH-PRINT-FROZEN-DATA: mutating settings after issue doesn't change the invoice", async () => {
      // Mutate shop_name live; the frozen vendorSnapshot shouldn't move.
      const { withTxInRoute } = await import("@/db/client");
      const { settings } = await import("@/db/schema");
      await withTxInRoute(undefined, async (tx) => {
        await tx
          .insert(settings)
          .values({ key: "shop_name", value: "POST-ISSUE-NAME" })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: "POST-ISSUE-NAME" },
          });
      });
      const r = await getInvoice({
        id: adminUserId,
        username: "admin",
        role: "pm",
        name: "A",
      });
      expect(r.status).toBe(200);
      const body = (await r.json()) as {
        invoice: { vendorSnapshot: { shopName: string } };
      };
      expect(body.invoice.vendorSnapshot.shopName).toBe("VITESSE ECO SAS");
    });

    // ───────── Component-level smoke — render PrintableInvoice ─────────

    it("T-POLISH-RENDER-PRINTABLE-INVOICE: synthetic DTO → HTML contains D-35 mentions", async () => {
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { PrintableInvoice } = await import(
        "@/app/(app)/invoices/[id]/print/PrintableInvoice"
      );
      const mod = await mockAndImport<{
        GET: (
          req: Request,
          ctx: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      }>(
        { id: adminUserId, username: "admin", role: "pm", name: "A" },
        "@/app/api/v1/invoices/[id]/route",
      );
      const res = await mod.GET(
        new Request(`http://localhost/api/v1/invoices/${invoiceId}`),
        { params: Promise.resolve({ id: String(invoiceId) }) },
      );
      const detail = (await res.json()) as Parameters<
        typeof PrintableInvoice
      >[0]["detail"];
      const html = renderToStaticMarkup(
        <PrintableInvoice detail={detail} />,
      );

      expect(html).toContain("FACTURE");
      expect(html).toContain("VITESSE ECO SAS");
      expect(html).toContain("SIRET");
      expect(html).toContain("SIREN");
      expect(html).toContain("N° TVA");
      expect(html).toContain("Espèces / À la livraison");
      expect(html).toContain(detail.invoice.refCode);
    });

    // ───────── Hash-chain integrity after reads ─────────

    it("T-POLISH-CHAIN-INTACT-AFTER-READS: verifyActivityLogChain remains null", async () => {
      const { withTxInRoute } = await import("@/db/client");
      const { verifyActivityLogChain } = await import("@/lib/activity-log");
      const before = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(before).toBeNull();
      // Trigger a few read paths from the polish surface.
      await getInvoice({
        id: adminUserId,
        username: "admin",
        role: "pm",
        name: "A",
      });
      await getInvoice({
        id: sellerId,
        username: "sel-55",
        role: "seller",
        name: "S",
      });
      const after = await withTxInRoute(undefined, (tx) =>
        verifyActivityLogChain(tx),
      );
      expect(after).toBeNull();
    });
  },
);
