import { notFound, redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead, withTxInRoute } from "@/db/client";
import { getSupplierById, updateSupplier } from "@/modules/suppliers/service";
import { UpdateSupplierPatch, type SupplierDto } from "@/modules/suppliers/dto";
import { NotFoundError } from "@/lib/api-errors";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

type Params = { params: Promise<{ id: string }> };

async function updateSupplierAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  const id = Number(formData.get("id") ?? "0");
  if (!Number.isFinite(id) || id < 1) redirect("/suppliers");

  const raw: Record<string, unknown> = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    active: formData.get("active") === "on",
  };
  const parsed = UpdateSupplierPatch.safeParse(raw);
  if (!parsed.success) redirect(`/suppliers/${id}/edit?error=validation`);

  try {
    await withTxInRoute(undefined, (tx) => updateSupplier(tx, id, parsed.data, claims.username));
  } catch {
    redirect(`/suppliers/${id}/edit?error=unknown`);
  }
  redirect("/suppliers");
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "البيانات المدخلة غير صحيحة.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

export default async function EditSupplierPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ error?: string }> }) {
  await enforcePageRole(["pm", "gm", "manager"]);
  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isFinite(supplierId) || supplierId < 1) notFound();

  let supplier: SupplierDto;
  try {
    supplier = await withRead(undefined, (db) => getSupplierById(db, supplierId));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <PageShell title={`تعديل: ${supplier.name}`}>
      {errorMsg && (
        <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorMsg}
        </div>
      )}
      <form action={updateSupplierAction}>
        <input type="hidden" name="id" value={supplier.id} />
        <FormCard
          footer={
            <>
              <a href="/suppliers" className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">إلغاء</a>
              <Button type="submit">حفظ</Button>
            </>
          }
        >
          <Field label="الاسم" htmlFor="name" required>
            <input id="name" name="name" type="text" defaultValue={supplier.name} required minLength={1} maxLength={256} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="الهاتف" htmlFor="phone">
            <input id="phone" name="phone" type="tel" defaultValue={supplier.phone} maxLength={64} dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="العنوان" htmlFor="address">
            <input id="address" name="address" type="text" defaultValue={supplier.address} maxLength={1024} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="ملاحظات" htmlFor="notes">
            <textarea id="notes" name="notes" defaultValue={supplier.notes} maxLength={2048} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="نشط" htmlFor="active" hint={`رصيد دائن حالي: ${supplier.creditDueFromSupplier.toFixed(2)} €`}>
            <label className="flex items-center gap-2 text-sm">
              <input id="active" name="active" type="checkbox" defaultChecked={supplier.active} />
              <span>{supplier.active ? "نشط" : "معطَّل"}</span>
            </label>
          </Field>
        </FormCard>
      </form>
    </PageShell>
  );
}
