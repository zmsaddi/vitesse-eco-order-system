import { notFound, redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead, withTxInRoute } from "@/db/client";
import { getClientById, updateClient } from "@/modules/clients/service";
import { UpdateClientInput, type ClientDto } from "@/modules/clients/dto";
import { NotFoundError } from "@/lib/api-errors";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

type Params = { params: Promise<{ id: string }> };

async function updateClientAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm", "manager"]);

  const id = Number(formData.get("id") ?? "0");
  if (!Number.isFinite(id) || id < 1) redirect("/clients");

  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    latinName: String(formData.get("latinName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    descriptionAr: String(formData.get("descriptionAr") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
  const parsed = UpdateClientInput.safeParse(raw);
  if (!parsed.success) {
    redirect(`/clients/${id}/edit?error=validation`);
  }

  try {
    await withTxInRoute(undefined, (tx) => updateClient(tx, id, parsed.data, claims.username));
  } catch {
    redirect(`/clients/${id}/edit?error=unknown`);
  }
  redirect("/clients");
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "البيانات المدخلة غير صحيحة.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

export default async function EditClientPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ error?: string }> }) {
  await enforcePageRole(["pm", "gm", "manager"]);
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId) || clientId < 1) notFound();

  let client: ClientDto;
  try {
    client = await withRead(undefined, (db) => getClientById(db, clientId));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <PageShell title={`تعديل: ${client.name}`}>
      {errorMsg && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      <form action={updateClientAction}>
        <input type="hidden" name="id" value={client.id} />

        <FormCard
          footer={
            <>
              <a
                href="/clients"
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                إلغاء
              </a>
              <Button type="submit">حفظ التغييرات</Button>
            </>
          }
        >
          <Field label="الاسم" htmlFor="name" required>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={client.name}
              required
              minLength={1}
              maxLength={256}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="الاسم باللاتينية" htmlFor="latinName">
            <input
              id="latinName"
              name="latinName"
              type="text"
              defaultValue={client.latinName}
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
              defaultValue={client.phone}
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
              defaultValue={client.email}
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
              defaultValue={client.address}
              maxLength={1024}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="ملاحظات" htmlFor="notes">
            <textarea
              id="notes"
              name="notes"
              defaultValue={client.notes}
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
