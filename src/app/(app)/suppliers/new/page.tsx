import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withTxInRoute } from "@/db/client";
import { createSupplier } from "@/modules/suppliers/service";
import { CreateSupplierInput } from "@/modules/suppliers/dto";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

async function createSupplierAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
  const parsed = CreateSupplierInput.safeParse(raw);
  if (!parsed.success) redirect("/suppliers/new?error=validation");
  try {
    await withTxInRoute(undefined, (tx) => createSupplier(tx, parsed.data, claims.username));
  } catch {
    redirect("/suppliers/new?error=unknown");
  }
  redirect("/suppliers");
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "البيانات المدخلة غير صحيحة.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await enforcePageRole(["pm", "gm", "manager"]);
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <PageShell title="مورد جديد">
      {errorMsg && (
        <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorMsg}
        </div>
      )}

      <form action={createSupplierAction}>
        <FormCard
          footer={
            <>
              <a href="/suppliers" className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">إلغاء</a>
              <Button type="submit">إنشاء</Button>
            </>
          }
        >
          <Field label="الاسم" htmlFor="name" required>
            <input id="name" name="name" type="text" required minLength={1} maxLength={256} autoFocus className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="الهاتف" htmlFor="phone">
            <input id="phone" name="phone" type="tel" maxLength={64} dir="ltr" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="العنوان" htmlFor="address">
            <input id="address" name="address" type="text" maxLength={1024} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
          <Field label="ملاحظات" htmlFor="notes">
            <textarea id="notes" name="notes" maxLength={2048} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800" />
          </Field>
        </FormCard>
      </form>
    </PageShell>
  );
}
