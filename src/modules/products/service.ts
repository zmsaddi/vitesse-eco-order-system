import { and, asc, count, eq } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { products, settings } from "@/db/schema";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/api-errors";
import { productRowToDto } from "./mappers";
import type { CreateProductInput, ProductDto, UpdateProductPatch } from "./dto";

// D-68 + D-69: products service.
// Soft-disable via `active=false` (H6 — never hard-deleted; preserves price_history + order refs).
// D-25: sku_limit enforced from settings before INSERT.

export type ListProductsOptions = {
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
};

export async function listProducts(
  db: DbHandle,
  opts: ListProductsOptions = {},
): Promise<{ rows: ProductDto[]; total: number }> {
  const limit = clampLimit(opts.limit);
  const offset = Math.max(0, opts.offset ?? 0);
  const filter = opts.includeInactive ? undefined : eq(products.active, true);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(filter)
      .orderBy(asc(products.name))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(products).where(filter),
  ]);

  return { rows: rows.map(productRowToDto), total: Number(total) };
}

export async function getProductById(db: DbHandle, id: number): Promise<ProductDto> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(`المنتج رقم ${id}`);
  return productRowToDto(row);
}

export async function createProduct(
  tx: DbTx,
  input: CreateProductInput,
  createdBy: string,
): Promise<ProductDto> {
  // D-25: sku_limit enforcement before INSERT.
  await assertWithinSkuLimit(tx);

  // Name uniqueness pre-check (schema has UNIQUE on products.name).
  const existing = await tx.select().from(products).where(eq(products.name, input.name)).limit(1);
  if (existing.length > 0) {
    throw new ConflictError(
      "منتج بنفس الاسم موجود مسبقاً. اختر اسماً آخر.",
      "DUPLICATE_PRODUCT_NAME",
      { existingId: existing[0].id },
    );
  }

  const inserted = await tx
    .insert(products)
    .values({
      name: input.name,
      category: input.category,
      unit: input.unit,
      buyPrice: input.buyPrice.toFixed(2),
      sellPrice: input.sellPrice.toFixed(2),
      stock: input.stock.toFixed(2),
      lowStockThreshold: input.lowStockThreshold,
      descriptionAr: input.descriptionAr,
      descriptionLong: input.descriptionLong,
      specs: input.specs,
      catalogVisible: input.catalogVisible,
      notes: input.notes,
      createdBy,
    })
    .returning();
  return productRowToDto(inserted[0]);
}

export async function updateProduct(
  tx: DbTx,
  id: number,
  patch: UpdateProductPatch,
  updatedBy: string,
): Promise<ProductDto> {
  const existing = await tx.select().from(products).where(eq(products.id, id)).limit(1);
  if (existing.length === 0) throw new NotFoundError(`المنتج رقم ${id}`);

  // BR-03: sellPrice must stay >= buyPrice after patch.
  const current = existing[0];
  const nextBuy = patch.buyPrice ?? Number(current.buyPrice);
  const nextSell = patch.sellPrice ?? Number(current.sellPrice);
  if (nextSell < nextBuy) {
    throw new BusinessRuleError(
      "سعر البيع يجب أن يكون أكبر أو مساوياً لسعر الشراء.",
      "PRICE_BELOW_COST",
      400,
      undefined,
      { buyPrice: nextBuy, sellPrice: nextSell },
    );
  }

  // Name uniqueness guard: if name is changing, make sure no OTHER product has it.
  if (patch.name !== undefined && patch.name !== current.name) {
    const conflicting = await tx
      .select()
      .from(products)
      .where(and(eq(products.name, patch.name)))
      .limit(1);
    if (conflicting.length > 0 && conflicting[0].id !== id) {
      throw new ConflictError(
        "منتج آخر بنفس الاسم موجود مسبقاً.",
        "DUPLICATE_PRODUCT_NAME",
        { existingId: conflicting[0].id },
      );
    }
  }

  const patchValues: Partial<typeof products.$inferInsert> = {
    updatedBy,
    updatedAt: new Date(),
  };
  if (patch.name !== undefined) patchValues.name = patch.name;
  if (patch.category !== undefined) patchValues.category = patch.category;
  if (patch.unit !== undefined) patchValues.unit = patch.unit;
  if (patch.buyPrice !== undefined) patchValues.buyPrice = patch.buyPrice.toFixed(2);
  if (patch.sellPrice !== undefined) patchValues.sellPrice = patch.sellPrice.toFixed(2);
  if (patch.stock !== undefined) patchValues.stock = patch.stock.toFixed(2);
  if (patch.lowStockThreshold !== undefined) patchValues.lowStockThreshold = patch.lowStockThreshold;
  if (patch.descriptionAr !== undefined) patchValues.descriptionAr = patch.descriptionAr;
  if (patch.descriptionLong !== undefined) patchValues.descriptionLong = patch.descriptionLong;
  if (patch.specs !== undefined) patchValues.specs = patch.specs;
  if (patch.catalogVisible !== undefined) patchValues.catalogVisible = patch.catalogVisible;
  if (patch.notes !== undefined) patchValues.notes = patch.notes;
  if (patch.active !== undefined) patchValues.active = patch.active;

  const updated = await tx.update(products).set(patchValues).where(eq(products.id, id)).returning();
  return productRowToDto(updated[0]);
}

// D-25: sku_limit = max active products. Read from settings (default 500).
async function assertWithinSkuLimit(tx: DbTx): Promise<void> {
  const [limitRow] = await tx
    .select()
    .from(settings)
    .where(eq(settings.key, "sku_limit"))
    .limit(1);
  const limit = limitRow ? Number(limitRow.value) : 500;
  if (!Number.isFinite(limit)) return; // malformed setting — don't block

  const [{ total }] = await tx
    .select({ total: count() })
    .from(products)
    .where(eq(products.active, true));
  if (Number(total) >= limit) {
    throw new BusinessRuleError(
      `وصلت الحد الأقصى للمنتجات النشطة (${limit}). عطِّل منتجاً قبل إضافة جديد.`,
      "SKU_LIMIT_REACHED",
      400,
      undefined,
      { limit, current: Number(total) },
    );
  }
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
function clampLimit(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_LIMIT;
  if (raw < 1) return DEFAULT_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(raw);
}
