import { notFound, redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead, withTxInRoute } from "@/db/client";
import { getProductById, updateProduct } from "@/modules/products/service";
import { UpdateProductPatch, type ProductDto } from "@/modules/products/dto";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/api-errors";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

type Params = { params: Promise<{ id: string }> };

async function updateProductAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm", "manager", "stock_keeper"]);
  const id = Number(formData.get("id") ?? "0");
  if (!Number.isFinite(id) || id < 1) redirect("/products");

  const raw: Record<string, unknown> = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    category: String(formData.get("category") ?? ""),
    unit: String(formData.get("unit") ?? ""),
    buyPrice: Number(formData.get("buyPrice") ?? 0),
    sellPrice: Number(formData.get("sellPrice") ?? 0),
    stock: Number(formData.get("stock") ?? 0),
    lowStockThreshold: Number(formData.get("lowStockThreshold") ?? 0),
    descriptionAr: String(formData.get("descriptionAr") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    catalogVisible: formData.get("catalogVisible") === "on",
    active: formData.get("active") === "on",
  };
  const parsed = UpdateProductPatch.safeParse(raw);
  if (!parsed.success) redirect(`/products/${id}/edit?error=validation`);

  try {
    await withTxInRoute(undefined, (tx) => updateProduct(tx, id, parsed.data, claims.username));
  } catch (err) {
    if (err instanceof ConflictError) redirect(`/products/${id}/edit?error=duplicate`);
    if (err instanceof BusinessRuleError && err.code === "PRICE_BELOW_COST") {
      redirect(`/products/${id}/edit?error=price`);
    }
    redirect(`/products/${id}/edit?error=unknown`);
  }
  redirect("/products");
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "البيانات المدخلة غير صحيحة.",
  duplicate: "منتج آخر بنفس الاسم موجود مسبقاً.",
  price: "سعر البيع يجب أن يكون أكبر أو مساوياً لسعر الشراء.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

export default async function EditProductPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ error?: string }> }) {
  await enforcePageRole(["pm", "gm", "manager", "stock_keeper"]);
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId) || productId < 1) notFound();

  let product: ProductDto;
  try {
    product = await withRead(undefined, (db) => getProductById(db, productId));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <PageShell title={`تعديل: ${product.name}`}>
      {errorMsg && (
        <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorMsg}
        </div>
      )}
      <form action={updateProductAction}>
        <input type="hidden" name="id" value={product.id} />
        <FormCard
          footer={
            <>
              <a href="/products" className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">إلغاء</a>
              <Button type="submit">حفظ</Button>
            </>
          }
        >
          <Field label="الاسم" htmlFor="name" required>
            <input id="name" name="name" type="text" defaultValue={product.name} required minLength={1} maxLength={256} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="التصنيف" htmlFor="category">
            <input id="category" name="category" type="text" defaultValue={product.category} maxLength={128} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="الوحدة" htmlFor="unit">
            <input id="unit" name="unit" type="text" defaultValue={product.unit} maxLength={64} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="سعر الشراء (€)" htmlFor="buyPrice" required>
              <input id="buyPrice" name="buyPrice" type="number" step="0.01" min="0" defaultValue={product.buyPrice.toFixed(2)} required dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
            <Field label="سعر البيع (€)" htmlFor="sellPrice" required>
              <input id="sellPrice" name="sellPrice" type="number" step="0.01" min="0" defaultValue={product.sellPrice.toFixed(2)} required dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="المخزون" htmlFor="stock">
              <input id="stock" name="stock" type="number" step="0.01" min="0" defaultValue={product.stock.toFixed(2)} dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
            <Field label="حد المخزون المنخفض" htmlFor="lowStockThreshold">
              <input id="lowStockThreshold" name="lowStockThreshold" type="number" step="1" min="0" defaultValue={product.lowStockThreshold} dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
          </div>
          <Field label="الوصف العربي" htmlFor="descriptionAr">
            <textarea id="descriptionAr" name="descriptionAr" defaultValue={product.descriptionAr} maxLength={2048} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="ملاحظات" htmlFor="notes">
            <textarea id="notes" name="notes" defaultValue={product.notes} maxLength={2048} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="الظهور في الكتالوج" htmlFor="catalogVisible">
            <label className="flex items-center gap-2 text-sm">
              <input id="catalogVisible" name="catalogVisible" type="checkbox" defaultChecked={product.catalogVisible} />
              <span>{product.catalogVisible ? "ظاهر" : "مخفي"}</span>
            </label>
          </Field>
          <Field label="نشط" htmlFor="active">
            <label className="flex items-center gap-2 text-sm">
              <input id="active" name="active" type="checkbox" defaultChecked={product.active} />
              <span>{product.active ? "نشط" : "معطَّل"}</span>
            </label>
          </Field>
        </FormCard>
      </form>
    </PageShell>
  );
}
