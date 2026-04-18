# ملاحظات تقنية — Technical Notes

> **رقم العنصر**: #34 | **المحور**: ح | **الحالة**: قيد التحديث

---

## Stack التقني

| الطبقة | التقنية |
|--------|---------|
| Framework | Next.js 16 + TypeScript strict (App Router) |
| CSS | Tailwind CSS v4 + shadcn/ui |
| ORM | Drizzle ORM + @neondatabase/serverless |
| Validation | Zod v4 (مشترك frontend + backend) |
| Data Fetching | TanStack Query (React Query) |
| State | Zustand (إشعارات + تفضيلات فقط) |
| Real-time | SSE مع polling fallback (Vercel timeout ~60s) |
| Auth | Auth.js v5 |
| Charts | Recharts |
| Voice | Groq (Whisper + Llama) |

## قيود الاستضافة المجانية

- Vercel Free: 100GB bandwidth, serverless functions
- Neon Free: 0.5GB storage, 190 compute hours/month
- لا Redis — rate limiting في الذاكرة (Map)
- الصور في Vercel Blob/Cloudinary (ليس DB)

## مبادئ الكود

1. **لا ملف يتجاوز 300 سطر** — تقسيم بـ domain modules
2. **TypeScript strict** — كل شيء مُعرّف النوع
3. **الأرقام المالية**: NUMERIC(19,2) → Drizzle يعيدها كـ string → parseFloat
4. **التواريخ**: DATE / TIMESTAMPTZ (ليس TEXT) — قرار M4
5. **المنطقة الزمنية**: Europe/Paris — قرار L3
6. **round2()**: Math.round((x + ε) × 100) / 100
7. **كل الأرقام TTC** — TVA فقط عند الفاتورة (H1)

## هيكل المشروع

```
src/
  db/schema/     (~18 ملف pgTable)
  db/client.ts   (اتصال + withTx)
  modules/       (~18 مجلد × queries.ts + schema.ts + hooks.ts)
  lib/           (auth, money, utils, constants, api-helpers)
  voice/         (5 ملفات)
  components/    (layout, data-table, forms, dialogs, ui)
  stores/        (notification, preference)
  providers/     (query, auth)
  types/
```
