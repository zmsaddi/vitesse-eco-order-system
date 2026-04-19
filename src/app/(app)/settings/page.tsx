import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead, withTxInRoute } from "@/db/client";
import {
  getAllSettings,
  getInvoiceReadiness,
  updateSettings,
} from "@/modules/settings/service";
import {
  INVOICE_READINESS_KEYS,
  SettingsPatch,
  type SettingsMapDto,
} from "@/modules/settings/dto";
import { PageShell } from "@/components/ui/PageShell";
import { FormCard, Field } from "@/components/ui/FormCard";
import { Button } from "@/components/ui/Button";

// D-28/D-35 Settings page — pm/gm only.
// Top banner warns when invoice-readiness fails (D-35 mandatory mentions empty).

async function saveSettingsAction(formData: FormData): Promise<never> {
  "use server";
  const claims = await enforcePageRole(["pm", "gm"]);

  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k === "_section") continue;
    if (typeof v === "string") raw[k] = v;
  }
  const parsed = SettingsPatch.safeParse(raw);
  if (!parsed.success) redirect("/settings?error=validation");

  try {
    await withTxInRoute(undefined, (tx) =>
      updateSettings(tx, parsed.data, claims.username),
    );
  } catch {
    redirect("/settings?error=unknown");
  }
  redirect("/settings?saved=1");
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "بعض الحقول غير صالحة.",
  unknown: "حدث خطأ. حاول مجدداً.",
};

const SECTIONS: {
  title: string;
  description?: string;
  fields: { key: string; label: string; hint?: string; ltr?: boolean; long?: boolean }[];
}[] = [
  {
    title: "بيانات المتجر",
    fields: [
      { key: "shop_name", label: "اسم المتجر" },
      { key: "shop_legal_form", label: "الشكل القانوني", hint: "مثال: SAS" },
      { key: "shop_address", label: "العنوان", long: true },
      { key: "shop_city", label: "المدينة" },
      { key: "shop_email", label: "البريد الإلكتروني", ltr: true },
      { key: "shop_website", label: "الموقع الإلكتروني", ltr: true },
    ],
  },
  {
    title: "البيانات الإلزامية على الفاتورة (D-35)",
    description:
      "هذه الحقول مطلوبة قانونياً قبل توليد أول فاتورة. إذا كان أي منها فارغاً، ستُحظر الفواتير.",
    fields: [
      { key: "shop_iban", label: "IBAN", ltr: true },
      { key: "shop_bic", label: "BIC", ltr: true },
      { key: "shop_capital_social", label: "رأس المال (€)", ltr: true },
      { key: "shop_rcs_city", label: "مدينة السجل التجاري" },
      { key: "shop_rcs_number", label: "رقم السجل التجاري (RCS)", ltr: true },
      { key: "shop_siren", label: "SIREN", ltr: true },
      { key: "shop_siret", label: "SIRET", ltr: true },
      { key: "shop_ape", label: "APE", ltr: true },
      { key: "shop_vat_number", label: "رقم الضريبة (VAT)", ltr: true },
    ],
  },
  {
    title: "الحدود المالية والتشغيلية",
    fields: [
      { key: "vat_rate", label: "معدل الضريبة الافتراضي (%)", ltr: true },
      { key: "invoice_currency", label: "عملة الفاتورة", ltr: true, hint: "EUR" },
      { key: "max_discount_seller_pct", label: "حد خصم البائع (%)", ltr: true },
      { key: "max_discount_manager_pct", label: "حد خصم المدير (%)", ltr: true },
      { key: "driver_custody_cap_eur", label: "سقف العهدة للسائق (€)", ltr: true },
      { key: "sku_limit", label: "الحد الأقصى للمنتجات النشطة", ltr: true },
    ],
  },
  {
    title: "المكافآت والعمولات",
    fields: [
      { key: "seller_bonus_fixed", label: "مكافأة البائع الثابتة (€)", ltr: true },
      { key: "seller_bonus_percentage", label: "مكافأة البائع (%)", ltr: true },
      { key: "driver_bonus_fixed", label: "مكافأة السائق الثابتة (€)", ltr: true },
    ],
  },
  {
    title: "الاحتفاظ بالبيانات",
    fields: [
      { key: "activity_log_retention_days", label: "مدة حفظ سجل النشاط (يوم)", ltr: true },
      { key: "voice_logs_retention_days", label: "مدة حفظ السجل الصوتي (يوم)", ltr: true },
      {
        key: "read_notifications_retention_days",
        label: "مدة حفظ التنبيهات المقروءة (يوم)",
        ltr: true,
      },
    ],
  },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await enforcePageRole(["pm", "gm"]);
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.unknown : null;
  const saved = sp.saved === "1";

  const [all, readiness] = await Promise.all([
    withRead(undefined, (db) => getAllSettings(db)),
    withRead(undefined, (db) => getInvoiceReadiness(db)),
  ]);
  const values: SettingsMapDto = all;

  return (
    <PageShell title="إعدادات النظام">
      {!readiness.ready && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <strong>تنبيه (D-35):</strong> لا يمكن توليد فواتير حالياً. الحقول الإلزامية المفقودة:{" "}
          {readiness.missing.join("، ")}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorMsg}
        </div>
      )}
      {saved && !errorMsg && (
        <div className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          تم الحفظ.
        </div>
      )}

      <form action={saveSettingsAction} className="space-y-6">
        {SECTIONS.map((section) => (
          <FormCard
            key={section.title}
            title={section.title}
            description={section.description}
          >
            {section.fields.map((f) => {
              const isMandatory = (INVOICE_READINESS_KEYS as readonly string[]).includes(f.key);
              const isEmpty = isMandatory && !(values[f.key] ?? "").trim();
              return (
                <Field
                  key={f.key}
                  label={isMandatory ? `${f.label} *` : f.label}
                  htmlFor={f.key}
                  hint={isEmpty ? "حقل إلزامي للفاتورة — فارغ حالياً" : f.hint}
                >
                  {f.long ? (
                    <textarea
                      id={f.key}
                      name={f.key}
                      defaultValue={values[f.key] ?? ""}
                      maxLength={4096}
                      rows={2}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
                    />
                  ) : (
                    <input
                      id={f.key}
                      name={f.key}
                      type="text"
                      defaultValue={values[f.key] ?? ""}
                      maxLength={4096}
                      dir={f.ltr ? "ltr" : undefined}
                      className={
                        "w-full rounded border px-3 py-2 text-sm focus:border-gray-900 focus:outline-none dark:bg-gray-800 " +
                        (isEmpty
                          ? "border-amber-400 dark:border-amber-600"
                          : "border-gray-300 dark:border-gray-700")
                      }
                    />
                  )}
                </Field>
              );
            })}
          </FormCard>
        ))}
        <div className="flex items-center justify-end">
          <Button type="submit">حفظ الإعدادات</Button>
        </div>
      </form>
    </PageShell>
  );
}
