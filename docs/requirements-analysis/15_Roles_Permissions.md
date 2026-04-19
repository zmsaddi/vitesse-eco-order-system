# الأدوار والصلاحيات — Roles & Permissions

> **رقم العنصر**: #15 | **المحور**: ج | **الحالة**: مواصفات نهائية
>
> **تطبيق**: صلاحيات v2 مدفوعة من قاعدة البيانات (جدول `permissions`) — ليست hardcoded في الكود. يُطبَّق عبر helper واحد `can(user, resource, action)` على كل route وعلى كل عنصر UI. انظر أسفل هذا الملف للتفاصيل.

---

## الأدوار (6 أدوار)

| # | الدور | الرمز | الوصف | الصندوق |
|---|-------|-------|-------|---------|
| 1 | مدير المشروع | `pm` | تحكم كامل — يرى ويفعل كل شيء | لا (يرى الكل) |
| 2 | مدير عام | `gm` | نفس PM — يملك الصندوق الرئيسي | الصندوق الرئيسي (كاش + بنك) |
| 3 | مدير | `manager` | يدير العمليات — صندوق فرعي خاص | صندوق فرعي |
| 4 | بائع | `seller` | يبيع ويحصّل — لا يرى الأسعار الداخلية | لا |
| 5 | سائق | `driver` | توصيل + جلب من موردين + تحصيل | عهدة نقدية |
| 6 | أمين مخزن | `stock_keeper` | مخزون + جرد + تحضير طلبات | لا |

---

## تسلسل الأدوار

```
PM ──── تحكم كامل بدون قيود
 │
GM ──── نفس PM + مالك الصندوق الرئيسي
 │
Manager ── عمليات يومية + صندوق فرعي
 │
 ├── Seller ── بيع + تحصيل + عمولة
 ├── Driver ── توصيل + جلب + تحصيل + عمولة
 └── Stock Keeper ── مخزون + جرد + تحضير
```

---

## مصفوفة الصلاحيات التفصيلية

### الطلبات (Orders)

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| عرض الكل | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| عرض الخاصة | — | — | — | ✅ | ✅ (مرتبطة) | ❌ |
| إنشاء | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| تعديل محجوز | ✅ | ✅ | ✅ | ✅ (خاصتي) | ❌ | ❌ |
| تعديل مؤكد | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إلغاء | ✅ | ✅ | ✅ (محجوز + قيد التحضير + جاهز — D-11) | ✅ (خاصتي المحجوزة) | ❌ | ❌ |
| إضافة هدية | ✅ | ✅ | ✅ | ✅ (من gift_pool) | ❌ | ❌ |
| تطبيق خصم | ✅ (بلا حد) | ✅ (بلا حد) | ✅ (حسب الحد) | ✅ (حسب الحد) | ❌ | ❌ |

### المشتريات (Purchases)

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| عرض | ✅ | ✅ | ✅ | ❌ | ❌ | 👁 |
| إنشاء | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| تعديل | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| حذف | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| دفع مورد | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

### المصاريف (Expenses)

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| عرض | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| إنشاء | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| تعديل | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| حذف | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### التوصيلات (Deliveries)

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| عرض الكل | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| عرض الخاصة | — | — | — | 👁 (مرتبطة) | ✅ (معيّنة لي) | ❌ |
| إنشاء | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| تعيين سائق | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| تأكيد التسليم | ✅ | ✅ | ✅ | ❌ | ✅ (خاصتي) | ❌ |
| إلغاء "جاري" | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

### مهام السائق + تحضير الطلبات

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| عرض المهام | ✅ | ✅ | ✅ | ❌ | ✅ (خاصتي) | ❌ |
| تعيين مهمة | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| تحديث حالة مهمة | ❌ | ❌ | ❌ | ❌ | ✅ (خاصتي) | ❌ |
| عرض طلبات التحضير | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| تحضير طلب | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

### المخزون والكتالوج

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| عرض المخزون | ✅ | ✅ | ✅ | 👁 (بدون أسعار شراء) | ❌ | ✅ |
| إضافة منتج | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| تعديل منتج | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (بدون أسعار) |
| تعطيل منتج | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| رفع صور | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| تحميل كتالوج PDF | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| تحديد هدايا | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### العملاء + الموردين

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| عرض العملاء | ✅ | ✅ | ✅ | 👁 (خاصتي فقط — orders.created_by = session.user) | ❌ | ❌ |
| إنشاء عميل | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| تعديل عميل | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| تفاصيل عميل | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| تحصيل دفعة | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| عرض الموردين | ✅ | ✅ | ✅ | ❌ | ❌ | 👁 |
| إنشاء مورد | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| حذف مورد | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### المالية

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| الفواتير (عرض) | ✅ | ✅ | ✅ | 👁 (خاصتي) | 👁 | ❌ |
| إلغاء فاتورة | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| الصندوق (عرض الكل) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| الصندوق (صندوقي) | — | — | ✅ | ❌ | 👁 (عهدتي) | ❌ |
| تمويل/تحويل صناديق | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| تسوية يومية | ✅ | ✅ | ✅ (صندوقي) | ❌ | ❌ | ❌ |
| تسليم أموال (سائق→مدير) | ❌ | ❌ | ✅ (استلام) | ❌ | ✅ (تسليم) | ❌ |
| التسويات | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| توزيع الأرباح (إنشاء) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| توزيع الأرباح (عرض) | ✅ | ✅ | 👁 | ❌ | ❌ | ❌ |
| عمولتي | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| عمولات الكل | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

### النظام

| العملية | PM | GM | Manager | Seller | Driver | Stock Keeper |
|---------|:--:|:--:|:-------:|:------:|:------:|:------------:|
| Dashboard (عرض) | ✅ | ✅ | ✅ | ✅ (خاصتي) | ✅ (خاصتي) | ✅ (خاصتي) |
| المستخدمين | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| الإعدادات | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| نسخ احتياطي | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| الصلاحيات (عرض) | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ |
| الصلاحيات (تعديل) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| سجل النشاطات (الكل) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| سجل النشاطات (محدود — فريقي) | — | — | 👁 | ❌ | ❌ | ❌ |
| الجرد | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| الإشعارات | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| تفضيلات الإشعارات (خاصتي) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `preparation_queue:view` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Stock Keeper — قائمة مقيَّدة بطلبات قيد التحضير) |

**ملاحظة D-12**: PM هو الوحيد الذي يعدِّل مصفوفة الصلاحيات في `/permissions`. GM يرى المصفوفة (`👁`) لكن لا يعدِّل. يمنع سيناريو GM يرفَّع نفسه.

**ملاحظة D-11**: Manager يُلغي طلبات في الحالات `محجوز + قيد التحضير + جاهز`. لا يُلغي `مؤكد`.

---

## رؤية البيانات حسب الدور

| البيانات | PM/GM | Manager | Seller | Driver | Stock Keeper |
|----------|:-----:|:-------:|:------:|:------:|:------------:|
| سعر الشراء (buy_price) | ✅ | ✅ | ❌ | ❌ | ✅ |
| التكلفة (cost_price) | ✅ | ✅ | ❌ | ❌ | ❌ |
| الربح (profit) | ✅ | ✅ | ❌ | ❌ | ❌ |
| حد التنبيه (threshold) | ✅ | ✅ | ❌ | ❌ | ✅ |
| أرصدة الصناديق | ✅ (الكل) | ✅ (صندوقي) | ❌ | 👁 (عهدتي) | ❌ |
| عمولات الآخرين | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## أهلية العمولة

| الدور | عمولة بيع | عمولة توصيل | ملاحظة |
|-------|:---------:|:-----------:|--------|
| PM | قابل للتكوين | قابل للتكوين | حسب الإعدادات (M1) |
| GM | قابل للتكوين | قابل للتكوين | حسب الإعدادات |
| Manager | قابل للتكوين | قابل للتكوين | حسب الإعدادات |
| Seller | ✅ | ❌ (افتراضي) | يكسب على مبيعاته |
| Driver | ❌ | ✅ | يكسب على توصيلاته |
| Stock Keeper | ❌ | ❌ | لا عمولات |

**العمولة تُحسب بمعدلات snapshot** من `order_items.commission_rule_snapshot JSONB` المُلتقَط لحظة **إنشاء** الـ order_item (قرار D-17 يلغي M14). تغيير القواعد بعد الإنشاء لا يُعدِّل الطلبات السابقة.

---

## آلية التطبيق التقنية

### جدول `permissions`

```sql
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL,        -- pm|gm|manager|seller|driver|stock_keeper
  resource TEXT NOT NULL,    -- orders|products|clients|treasury|...
  action TEXT NOT NULL,      -- view|create|edit|delete|approve|view_all|view_own
  allowed BOOLEAN DEFAULT false,
  UNIQUE (role, resource, action)
);
```

### Architecture (D-59 — Middleware JWT-only)

طبقتان منفصلتان للصلاحيات:

1. **Middleware (`src/middleware.ts`)** — يقرأ role من JWT **فقط** (بلا DB calls). يحمي routes **coarse-grained** (e.g. منع seller من `/settings`). سريع (<10ms per request).

2. **API routes (`can()` helper)** — صلاحيات granular داخل كل route (e.g. `can(role, 'orders', 'edit_price_below_cost')`). يستعلم DB مع cache 60s.

**السبب**: middleware داخل Neon HTTP driver مع WebSocket Pool = تأخير 100-200ms لكل request. JWT-only = 0 DB call، سريع + موثوق.

### Helper `can()`

```ts
// src/lib/can.ts
import { db } from '@/db/client';
import { permissions } from '@/db/schema/permissions';
import { and, eq } from 'drizzle-orm';

const cache = new Map<string, { allowed: boolean; expiresAt: number }>();
const TTL = 60_000;

export async function can(role: string, resource: string, action: string): Promise<boolean> {
  const key = `${role}:${resource}:${action}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  const [row] = await db.select().from(permissions)
    .where(and(eq(permissions.role, role), eq(permissions.resource, resource), eq(permissions.action, action)))
    .limit(1);
  const allowed = row?.allowed ?? false;
  cache.set(key, { allowed, expiresAt: Date.now() + TTL });
  return allowed;
}

export function invalidatePermissionsCache() {
  cache.clear();
}
```

- Cache محلّي لكل instance (60s TTL).
- Invalidation يدوي عند POST/PUT على `/api/permissions`.
- الـ cold-start لا يُفوِّت سجل — الـ cache يُعاد بناؤه طبيعياً.

### الاستخدام في الـ API

```ts
// مثال: /api/orders POST
import { requireAuth } from '@/lib/api-auth';
import { can } from '@/lib/can';

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  if (!(await can(auth.session.user.role, 'orders', 'create'))) {
    return apiError(new PermissionError(), 'غير مصرح', 403);
  }
  // ...
}
```

### الاستخدام في الـ Sidebar

```tsx
// src/components/layout/sidebar.tsx
import { can } from '@/lib/can';
import { auth } from '@/auth';

export default async function Sidebar() {
  const session = await auth();
  const role = session?.user?.role;

  const visibleItems = await Promise.all(
    NAV_ITEMS.map(async (item) => ({
      ...item,
      visible: await can(role, item.resource, 'view'),
    }))
  );

  return <nav>{visibleItems.filter(i => i.visible).map(...)}</nav>;
}
```

### صفحة إدارة الصلاحيات `/permissions`

- مُتاحة لـ `pm` فقط.
- مصفوفة UI تفاعلية: 6 أدوار × ~15 resource × ~5 actions.
- كل toggle → POST `/api/permissions` → تحديث DB + `invalidatePermissionsCache()`.
- يُستخدم للتعديلات بعد التشغيل الأولي. الافتراضي مأخوذ من seed في Phase 1.

### Default seed

عند `/api/init` أول مرة، يُدرج الصف الافتراضي لكل (role × resource × action) مطابقاً للجداول أعلاه.
