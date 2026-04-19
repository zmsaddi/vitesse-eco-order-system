import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withTxInRoute } from "@/db/client";
import { createProduct } from "@/modules/products/service";
import { CreateProductInput } from "@/modules/products/dto";
import { BusinessRuleError, ConflictError } from "@/lib/api-errors";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

async function createProductAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm", "manager", "stock_keeper"]);

  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    unit: String(formData.get("unit") ?? "").trim(),
    buyPrice: Number(formData.get("buyPrice") ?? 0),
    sellPrice: Number(formData.get("sellPrice") ?? 0),
    stock: Number(formData.get("stock") ?? 0),
    lowStockThreshold: Number(formData.get("lowStockThreshold") ?? 3),
    descriptionAr: String(formData.get("descriptionAr") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    catalogVisible: formData.get("catalogVisible") === "on",
  };
  const parsed = CreateProductInput.safeParse(raw);
  if (!parsed.success) redirect("/products/new?error=validation");

  try {
    await withTxInRoute(undefined, (tx) => createProduct(tx, parsed.data, claims.username));
  } catch (err) {
    if (err instanceof ConflictError) redirect("/products/new?error=duplicate");
    if (err instanceof BusinessRuleError && err.code === "SKU_LIMIT_REACHED") {
      redirect("/products/new?error=sku_limit");
    }
    if (err instanceof BusinessRuleError && err.code === "PRICE_BELOW_COST") {
      redirect("/products/new?error=price");
    }
    redirect("/products/new?error=unknown");
  }
  redirect("/products");
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "البيانات المدخلة غير صحيحة. تأكد أن سعر البيع ≥ سعر الشراء.",
  duplicate: "منتج بنفس الاسم موجود مسبقاً.",
  sku_limit: "وصلت الحد الأقصى للمنتجات النشطة. عطِّل منتجاً قبل إضافة جديد.",
  price: "سعر البيع يجب أن يكون أكبر أو مساوياً لسعر الشراء.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await enforcePageRole(["pm", "gm", "manager", "stock_keeper"]);
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <PageShell title="منتج جديد">
      {errorMsg && (
        <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorMsg}
        </div>
      )}

      <form action={createProductAction}>
        <FormCard
          footer={
            <>
              <a href="/products" className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">إلغاء</a>
              <Button type="submit">إنشاء</Button>
            </>
          }
        >
          <Field label="الاسم" htmlFor="name" required>
            <input id="name" name="name" type="text" required minLength={1} maxLength={256} autoFocus className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="التصنيف" htmlFor="category">
            <input id="category" name="category" type="text" maxLength={128} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="الوحدة" htmlFor="unit" hint="مثال: قطعة / كجم / لتر">
            <input id="unit" name="unit" type="text" maxLength={64} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="سعر الشراء (€)" htmlFor="buyPrice" required>
              <input id="buyPrice" name="buyPrice" type="number" step="0.01" min="0" required dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
            <Field label="سعر البيع (€)" htmlFor="sellPrice" required hint="يجب أن يكون ≥ سعر الشراء">
              <input id="sellPrice" name="sellPrice" type="number" step="0.01" min="0" required dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="المخزون الابتدائي" htmlFor="stock">
              <input id="stock" name="stock" type="number" step="0.01" min="0" defaultValue="0" dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
            <Field label="حد المخزون المنخفض" htmlFor="lowStockThreshold">
              <input id="lowStockThreshold" name="lowStockThreshold" type="number" step="1" min="0" defaultValue="3" dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
            </Field>
          </div>
          <Field label="الوصف العربي" htmlFor="descriptionAr">
            <textarea id="descriptionAr" name="descriptionAr" maxLength={2048} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="ملاحظات" htmlFor="notes">
            <textarea id="notes" name="notes" maxLength={2048} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="الظهور في الكتالوج" htmlFor="catalogVisible">
            <label className="flex items-center gap-2 text-sm">
              <input id="catalogVisible" name="catalogVisible" type="checkbox" defaultChecked />
              <span>ظاهر في الكتالوج العام</span>
            </label>
          </Field>
        </FormCard>
      </form>
    </PageShell>
  );
}
