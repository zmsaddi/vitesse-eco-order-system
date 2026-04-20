import { and, eq } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import {
  giftPool,
  productCommissionRules,
  products,
  settings as settingsTable,
  userBonusRates,
} from "@/db/schema";
import { BusinessRuleError } from "@/lib/api-errors";
import type { Role } from "@/lib/session-claims";
import type { CreateOrderItemInput } from "./dto";

// Phase 3.1 pricing + commission-snapshot module.
// BR-03: unit_price (post-discount) ≥ cost_price. Exception: is_gift forces 0.
// BR-21/22: VIN required for items whose category ∈ settings.vin_required_categories.
// BR-35..39: gifts decrement stock + gift_pool under FOR UPDATE, line_total=0.
// BR-41: discount cap per role — seller≤max_discount_seller_pct, manager≤max_discount_manager_pct, pm/gm unlimited.
// D-17: commission_rule_snapshot = merge(user_bonus_rates → product_commission_rules → settings defaults), frozen at create time.

export type ProcessedItemRow = {
  productId: number;
  productNameCached: string;
  category: string;
  quantity: string;
  recommendedPrice: string;
  unitPrice: string;
  costPrice: string;
  discountType: "percent" | "fixed" | null;
  discountValue: string | null;
  lineTotal: string;
  isGift: boolean;
  vin: string;
  commissionRuleSnapshot: Record<string, unknown>;
};

export type PricingContext = {
  role: Role;
  username: string;
  vinRequiredCategories: Set<string>;
  maxDiscountSellerPct: number;
  maxDiscountManagerPct: number;
  defaults: {
    sellerFixed: number;
    sellerPercentage: number;
    driverFixed: number;
  };
};

const DEFAULT_SELLER_CAP = 5;
const DEFAULT_MANAGER_CAP = 15;

/**
 * Load pricing context from settings + per-user overrides. Called once per order
 * create (not per item) — the resulting context is reused across all items.
 */
export async function loadPricingContext(
  tx: DbTx,
  claims: { role: Role; username: string },
): Promise<PricingContext> {
  const rows = await tx.select().from(settingsTable);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const vinRaw = s.vin_required_categories ?? "";
  let vinCats: string[] = [];
  try {
    const parsed = JSON.parse(vinRaw);
    if (Array.isArray(parsed)) vinCats = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    vinCats = [];
  }

  const numOrDefault = (key: string, def: number): number => {
    const n = Number(s[key]);
    return Number.isFinite(n) ? n : def;
  };

  return {
    role: claims.role,
    username: claims.username,
    vinRequiredCategories: new Set(vinCats),
    maxDiscountSellerPct: numOrDefault("max_discount_seller_pct", DEFAULT_SELLER_CAP),
    maxDiscountManagerPct: numOrDefault("max_discount_manager_pct", DEFAULT_MANAGER_CAP),
    defaults: {
      sellerFixed: numOrDefault("seller_bonus_fixed", 0),
      sellerPercentage: numOrDefault("seller_bonus_percentage", 0),
      driverFixed: numOrDefault("driver_bonus_fixed", 0),
    },
  };
}

/**
 * Return the effective discount cap (%) for this caller. Gifts bypass via is_gift
 * (caller checks first). pm/gm have no cap — we return Infinity.
 */
function discountCapPct(ctx: PricingContext): number {
  switch (ctx.role) {
    case "pm":
    case "gm":
      return Infinity;
    case "manager":
      return ctx.maxDiscountManagerPct;
    case "seller":
      return ctx.maxDiscountSellerPct;
    default:
      // driver/stock_keeper — not expected to reach here (role gate blocks).
      return 0;
  }
}

/**
 * Compute the post-discount unit price for an input row. Input may arrive with:
 *   - isGift=true → unit=0, line_total=0 (BR-36/37); discount tracked as percent=100.
 *   - discountType='percent' + discountValue ∈ [0, 100] → unit = recommended × (1 - v/100)
 *   - discountType='fixed' + discountValue ≥ 0 → unit = recommended - v (clamped ≥ 0)
 *   - no discount → unit = input.unitPrice; recommended = product.sellPrice; if the
 *     client sent a unitPrice < recommended, the delta is treated as an implicit
 *     percent discount and still capped.
 */
function deriveFinalUnit(
  input: CreateOrderItemInput,
  recommended: number,
): { unit: number; discountType: "percent" | "fixed" | null; discountValue: number | null; discountPct: number } {
  if (input.isGift) {
    return { unit: 0, discountType: "percent", discountValue: 100, discountPct: 100 };
  }
  if (input.discountType === "percent" && typeof input.discountValue === "number") {
    const unit = round2(recommended * (1 - input.discountValue / 100));
    return { unit, discountType: "percent", discountValue: input.discountValue, discountPct: input.discountValue };
  }
  if (input.discountType === "fixed" && typeof input.discountValue === "number") {
    const unit = Math.max(0, round2(recommended - input.discountValue));
    const pct = recommended > 0 ? ((recommended - unit) / recommended) * 100 : 0;
    return { unit, discountType: "fixed", discountValue: input.discountValue, discountPct: pct };
  }
  // No explicit discount — client sent final unitPrice directly.
  const unit = round2(input.unitPrice);
  const pct = recommended > 0 ? ((recommended - unit) / recommended) * 100 : 0;
  return { unit, discountType: null, discountValue: null, discountPct: Math.max(0, pct) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build the D-17 commission-rule snapshot. Priority: user override → per-category
 * rule → settings defaults. Missing pieces fall through to the next level.
 */
async function buildCommissionSnapshot(
  tx: DbTx,
  ctx: PricingContext,
  category: string,
): Promise<Record<string, unknown>> {
  const [userRow] = await tx
    .select()
    .from(userBonusRates)
    .where(eq(userBonusRates.username, ctx.username))
    .limit(1);
  const [catRow] = category
    ? await tx
        .select()
        .from(productCommissionRules)
        .where(and(eq(productCommissionRules.category, category), eq(productCommissionRules.active, true)))
        .limit(1)
    : [undefined];

  const sellerFixed =
    userRow?.sellerFixed != null
      ? Number(userRow.sellerFixed)
      : catRow?.sellerFixedPerUnit != null
      ? Number(catRow.sellerFixedPerUnit)
      : ctx.defaults.sellerFixed;
  const sellerPct =
    userRow?.sellerPercentage != null
      ? Number(userRow.sellerPercentage)
      : catRow?.sellerPctOverage != null
      ? Number(catRow.sellerPctOverage)
      : ctx.defaults.sellerPercentage;
  const driverFixed =
    userRow?.driverFixed != null
      ? Number(userRow.driverFixed)
      : catRow?.driverFixedPerDelivery != null
      ? Number(catRow.driverFixedPerDelivery)
      : ctx.defaults.driverFixed;

  const source: "user_override" | "category_rule" | "default" =
    userRow ? "user_override" : catRow ? "category_rule" : "default";

  return {
    source,
    seller_fixed_per_unit: sellerFixed,
    seller_pct_overage: sellerPct,
    driver_fixed_per_delivery: driverFixed,
    captured_at: new Date().toISOString(),
  };
}

/**
 * Validate + compute one order item. Callers MUST have already acquired the
 * canonical row-locks via `acquireOrderCreateLocks()` in ./locks before calling
 * this. The lock ordering there (product ids ascending, then gift_pool product
 * ids ascending) is what makes the create path deadlock-free regardless of
 * per-request item order (29_Concurrency.md — one-shot lock at tx start).
 *
 * This function issues only plain SELECT/UPDATE on rows that are already held
 * under transaction-scoped exclusive locks — no FOR UPDATE here.
 */
export async function processOrderItem(
  tx: DbTx,
  ctx: PricingContext,
  input: CreateOrderItemInput,
): Promise<ProcessedItemRow> {
  // Row already locked by the pre-flight acquireOrderCreateLocks().
  const prodRows = await tx
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      buyPrice: products.buyPrice,
      sellPrice: products.sellPrice,
      stock: products.stock,
      active: products.active,
    })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  if (prodRows.length === 0 || !prodRows[0].active) {
    throw new BusinessRuleError(
      `المنتج رقم ${input.productId} غير موجود أو معطَّل.`,
      "PRODUCT_UNAVAILABLE",
      400,
      undefined,
      { productId: input.productId },
    );
  }
  const product = prodRows[0];
  const recommended = Number(product.sellPrice);
  const cost = Number(product.buyPrice);
  const currentStock = Number(product.stock);

  // VIN first (category-level gate — applies whether or not the item is a gift).
  const vinRequired = ctx.vinRequiredCategories.has(product.category);
  if (vinRequired && !input.vin.trim()) {
    throw new BusinessRuleError(
      `VIN مطلوب للمنتج ${product.name} (الفئة ${product.category}).`,
      "VIN_REQUIRED",
      400,
      undefined,
      { productId: input.productId, category: product.category },
    );
  }

  // Gift pool check + decrement (BR-35/36) — gift_pool row pre-locked by
  // acquireOrderCreateLocks(). Check quantity; decrement atomically.
  if (input.isGift) {
    const poolRows = await tx
      .select({ id: giftPool.id, quantity: giftPool.quantity })
      .from(giftPool)
      .where(eq(giftPool.productId, input.productId))
      .limit(1);
    if (poolRows.length === 0) {
      throw new BusinessRuleError(
        `المنتج ${product.name} غير مخصَّص للإهداء (لا يوجد في gift_pool).`,
        "NOT_IN_GIFT_POOL",
        400,
        undefined,
        { productId: input.productId },
      );
    }
    const poolRow = poolRows[0];
    const poolQty = Number(poolRow.quantity);
    if (poolQty < input.quantity) {
      throw new BusinessRuleError(
        `الكمية المتوفرة للإهداء أقل من المطلوبة (${poolQty} < ${input.quantity}).`,
        "GIFT_POOL_INSUFFICIENT",
        400,
        undefined,
        { productId: input.productId, available: poolQty, requested: input.quantity },
      );
    }
    await tx
      .update(giftPool)
      .set({ quantity: (poolQty - input.quantity).toFixed(2) })
      .where(eq(giftPool.id, poolRow.id));
  }

  // Stock guard (BR-38: gifts also decrement stock).
  if (currentStock < input.quantity) {
    throw new BusinessRuleError(
      `المخزون غير كافٍ للمنتج ${product.name}.`,
      "STOCK_INSUFFICIENT",
      400,
      undefined,
      { productId: input.productId, currentStock, requested: input.quantity },
    );
  }

  // Discount derivation + cap enforcement (BR-41).
  const { unit, discountType, discountValue, discountPct } = deriveFinalUnit(input, recommended);
  if (!input.isGift) {
    const cap = discountCapPct(ctx);
    if (discountPct - 0.001 > cap) {
      throw new BusinessRuleError(
        `الخصم (${discountPct.toFixed(2)}%) يتجاوز الحد المسموح لدورك (${cap}%).`,
        "DISCOUNT_OVER_LIMIT",
        403,
        undefined,
        { role: ctx.role, discountPct, capPct: cap, productId: input.productId },
      );
    }
    // BR-03: post-discount unit ≥ cost. NEVER leak cost in the public error
    // body (16_Data_Visibility: seller cannot see buy_price). Only productId +
    // attempted unitPrice are surfaced; the cost delta stays server-side.
    if (unit < cost) {
      throw new BusinessRuleError(
        "سعر البيع غير مقبول.",
        "PRICE_BELOW_COST",
        400,
        `unit=${unit} < cost=${cost} for productId=${input.productId}`,
        { productId: input.productId, unitPrice: unit },
      );
    }
  }

  const lineTotal = input.isGift ? 0 : round2(input.quantity * unit);
  const commissionRuleSnapshot = await buildCommissionSnapshot(tx, ctx, product.category);

  // Decrement product stock (BR-38 — gifts too, "مثل أي صنف").
  await tx
    .update(products)
    .set({ stock: (currentStock - input.quantity).toFixed(2) })
    .where(eq(products.id, input.productId));

  return {
    productId: input.productId,
    productNameCached: product.name,
    category: product.category,
    quantity: input.quantity.toFixed(2),
    recommendedPrice: recommended.toFixed(2),
    unitPrice: unit.toFixed(2),
    costPrice: cost.toFixed(2),
    discountType,
    discountValue: discountValue != null ? discountValue.toFixed(2) : null,
    lineTotal: lineTotal.toFixed(2),
    isGift: input.isGift,
    vin: input.vin,
    commissionRuleSnapshot,
  };
}
