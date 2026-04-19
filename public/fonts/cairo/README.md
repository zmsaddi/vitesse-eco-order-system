# Cairo — Local Fonts

> **العنوان**: `public/fonts/cairo/`
> **الغرض**: حاوية لخط Cairo (نسخة محلية) ليُحمَّل عبر `next/font/local` بدل `next/font/google`.
> **المستند الحاكم**: قرار D-15 في [../../../docs/requirements-analysis/00_DECISIONS.md](../../../docs/requirements-analysis/00_DECISIONS.md).

---

## لماذا محلية (وليس Google Fonts)

- `next/font/google` يتطلب اتصال إنترنت وقت `next build`.
- فشل CI build أثناء Phase 0 السابق كان سببه هذا بالضبط (Cairo من Google).
- الخط المحلي يجعل الـ build self-contained ويعمل بلا شبكة.

---

## الملفات المطلوبة (تُضاف في Phase 0)

| الملف | الوزن | الاستخدام |
|---|:---:|---|
| `Cairo-Regular.ttf` | 400 | النص العادي |
| `Cairo-SemiBold.ttf` | 600 | العناوين الفرعية + أزرار |
| `Cairo-Bold.ttf` | 700 | العناوين الرئيسية |

**المصدر**: [Google Fonts — Cairo family](https://fonts.google.com/specimen/Cairo) → "Download family" → فك الضغط → ضع الـ 3 ملفات هنا.

**الترخيص**: SIL Open Font License 1.1 (OFL). يُلتزم `OFL.txt` في نفس المجلد.

---

## الاستخدام في الكود (Phase 0)

```ts
// src/app/layout.tsx
import localFont from 'next/font/local';

const cairo = localFont({
  src: [
    { path: '../../public/fonts/cairo/Cairo-Regular.ttf',  weight: '400', style: 'normal' },
    { path: '../../public/fonts/cairo/Cairo-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../public/fonts/cairo/Cairo-Bold.ttf',     weight: '700', style: 'normal' },
  ],
  variable: '--font-cairo',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
```

---

## حالة هذا المجلد الآن

- المجلد موجود لتوثيق العقد (هذا الـ README).
- ملفات `.ttf` **غير مُلتزمة بعد** — ستُضاف في أول commit من Phase 0 مع `OFL.txt`.
- حتى يتم ذلك، لا يُستورَد الخط في أي كود. Phase 0 يُضيف الملفات + الاستيراد معاً.
