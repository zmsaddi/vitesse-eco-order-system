import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withTxInRoute } from "@/db/client";
import { createClient } from "@/modules/clients/service";
import { CreateClientInput } from "@/modules/clients/dto";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

type SearchParams = { error?: string };

async function createClientAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm", "manager", "seller"]);

  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    latinName: String(formData.get("latinName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    descriptionAr: String(formData.get("descriptionAr") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  const parsed = CreateClientInput.safeParse(raw);
  if (!parsed.success) {
    redirect("/clients/new?error=validation");
  }

  try {
    await withTxInRoute(undefined, (tx) => createClient(tx, parsed.data, claims.username));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "DUPLICATE_CLIENT") {
      redirect("/clients/new?error=duplicate");
    }
    redirect("/clients/new?error=unknown");
  }
  redirect("/clients");
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "البيانات المدخلة غير صحيحة. راجع الحقول المميَّزة.",
  duplicate: "عميل بنفس الاسم والهاتف موجود مسبقاً.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await enforcePageRole(["pm", "gm", "manager", "seller"]);
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <PageShell title="عميل جديد">
      {errorMsg && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      <form action={createClientAction}>
        <FormCard
          footer={
            <>
              <a
                href="/clients"
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                إلغاء
              </a>
              <Button type="submit">إنشاء</Button>
            </>
          }
        >
          <Field label="الاسم" htmlFor="name" required>
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={1}
              maxLength={256}
              autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="الاسم باللاتينية" htmlFor="latinName" hint="اختياري — للفواتير الفرنسية">
            <input
              id="latinName"
              name="latinName"
              type="text"
              maxLength={256}
              dir="ltr"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="الهاتف" htmlFor="phone">
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={64}
              dir="ltr"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="البريد الإلكتروني" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              maxLength={256}
              dir="ltr"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="العنوان" htmlFor="address">
            <input
              id="address"
              name="address"
              type="text"
              maxLength={1024}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="ملاحظات" htmlFor="notes">
            <textarea
              id="notes"
              name="notes"
              maxLength={2048}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>
        </FormCard>
      </form>
    </PageShell>
  );
}
