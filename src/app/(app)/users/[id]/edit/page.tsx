import { notFound, redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead, withTxInRoute } from "@/db/client";
import { getUserById, updateUser, type UpdateUserInput } from "@/modules/users/service";
import { RoleDto, type UserDto } from "@/modules/users/dto";
import { NotFoundError } from "@/lib/api-errors";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

type Params = { params: Promise<{ id: string }> };

async function updateUserAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm"]);

  const id = Number(formData.get("id") ?? "0");
  if (!Number.isFinite(id) || id < 1) redirect("/users");

  const roleRaw = String(formData.get("role") ?? "");
  const roleParsed = RoleDto.safeParse(roleRaw);

  const patch: UpdateUserInput = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    role: roleParsed.success ? roleParsed.data : undefined,
    active: formData.get("active") === "on",
    profitSharePct: Number(formData.get("profitSharePct") ?? 0),
  };

  try {
    await withTxInRoute(undefined, (tx) => updateUser(tx, id, patch, claims.username));
  } catch {
    redirect(`/users/${id}/edit?error=unknown`);
  }
  redirect("/users");
}

const ROLE_OPTIONS: Array<{ value: UserDto["role"]; labelAr: string }> = [
  { value: "pm", labelAr: "مدير المشروع" },
  { value: "gm", labelAr: "مدير عام" },
  { value: "manager", labelAr: "مدير فرعي" },
  { value: "seller", labelAr: "بائع" },
  { value: "driver", labelAr: "سائق" },
  { value: "stock_keeper", labelAr: "أمين مخزن" },
];

export default async function EditUserPage({ params }: Params) {
  await enforcePageRole(["pm", "gm"]);
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId) || userId < 1) notFound();

  let user: UserDto;
  try {
    user = await withRead(undefined, (db) => getUserById(db, userId));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <PageShell
      title={`تعديل: ${user.name}`}
      subtitle={`اسم المستخدم: ${user.username}`}
    >
      <form action={updateUserAction}>
        <input type="hidden" name="id" value={user.id} />

        <FormCard
          footer={
            <>
              <a
                href="/users"
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                إلغاء
              </a>
              <Button type="submit">حفظ التغييرات</Button>
            </>
          }
        >
          <Field
            label="اسم المستخدم"
            htmlFor="username-display"
            hint="لا يمكن تعديله بعد الإنشاء."
          >
            <input
              id="username-display"
              value={user.username}
              disabled
              dir="ltr"
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="الاسم الكامل" htmlFor="name" required>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={user.name}
              required
              minLength={1}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field label="الدور" htmlFor="role" required>
            <select
              id="role"
              name="role"
              defaultValue={user.role}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.labelAr}
                </option>
              ))}
            </select>
          </Field>

          <Field label="نسبة المشاركة في الأرباح (%)" htmlFor="profitSharePct">
            <input
              id="profitSharePct"
              name="profitSharePct"
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={user.profitSharePct}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
            />
          </Field>

          <Field
            label="نشط"
            htmlFor="active"
            hint="أزل التحديد لتعطيل الحساب (soft-disable — لا يُحذف، يُمنع فقط تسجيل الدخول)."
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                id="active"
                name="active"
                type="checkbox"
                defaultChecked={user.active}
              />
              <span>{user.active ? "الحساب نشط" : "الحساب معطَّل"}</span>
            </label>
          </Field>
        </FormCard>
      </form>
    </PageShell>
  );
}
