# الإشعارات والتنبيهات — Notifications

> **رقم العنصر**: #26 | **المحور**: هـ | **الحالة**: مواصفات نهائية

---

## البنية التقنية (D-14 + D-41 + D-42)

| البند | التفصيل |
|-------|---------|
| Real-time | **Polling فقط** — D-41 حذف SSE كلياً (Neon HTTP driver لا يدعم LISTEN/NOTIFY، و Vercel function timeout 300s يقطع SSE). إذا احتاجت المشروع push لاحقاً، يُقيَّم Ably/Pusher free-tier كمكوِّن مستقل. |
| **Notifications cadence (D-42)** | **on-demand فقط** عند فتح Bell Dropdown. badge count يُرفَع عبر header `X-Unread-Count` في كل response عادي (لا polling مستقل للـ badge). |
| **DataTables cadence (D-42)** | **90s افتراضي**، يُضاعَف إلى **180s** بعد 3 دقائق idle (visibility/focus). |
| Monitoring (D-42) | `/api/cron/hourly` يسجِّل Neon compute hours في `settings.neon_hours_used_this_month` — alert عند تجاوز 150h (من 190h الحصة). |
| التخزين | جدول `notifications` في DB |
| التفضيلات | جدول `notification_preferences` (قابل للتكوين لكل مستخدم) |
| القنوات (D-22) | `in_app` فقط في MVP. email/push محذوفان من CHECK — لا SMTP ولا Web Push في stack |
| Retention | الإشعارات المقروءة تُحذف بعد 60 يوم عبر `/api/cron/daily` |

## واجهة الإشعارات

- **جرس** في Topbar مع عدد غير المقروء (badge).
- **Dropdown** عند النقر: آخر 10 إشعارات + رابط "عرض الكل".
- **صفحة كاملة** `/notifications`: كل الإشعارات + فلاتر (النوع، قُرئ/غير مقروء، نطاق تاريخي) + pagination (50/صفحة).

## الإشعارات حسب الدور

| الحدث | PM/GM | Manager | Seller | Driver | Stock Keeper |
|-------|:-----:|:-------:|:------:|:------:|:------------:|
| طلب جديد | ✅ | ✅ | ❌ | ❌ | ✅ (للتحضير) |
| انتقال طلب → قيد التحضير | ❌ | ❌ | ❌ | ❌ | ✅ |
| طلب جاهز للتوصيل | ❌ | ❌ | ❌ | ✅ (المعيَّن) | ❌ |
| توصيل مؤكد | ✅ | ✅ | ✅ (طلبي) | ❌ | ❌ |
| دفعة مستلمة | ✅ | ✅ | ❌ | ❌ | ❌ |
| مخزون منخفض (< `low_stock_threshold`) | ✅ | ✅ | ❌ | ❌ | ✅ |
| مهمة جديدة | ❌ | ❌ | ❌ | ✅ | ❌ |
| عمولة جديدة | ❌ | ❌ | ✅ | ✅ | ❌ |
| تسوية/مكافأة | ❌ | ❌ | ✅ | ✅ | ❌ |
| طلب ملغي | ✅ | ✅ | ✅ (طلبي) | ✅ (توصيلي) | ❌ |
| سائق سلّم أموال | ❌ | ✅ | ❌ | ❌ | ❌ |
| هدايا متاحة (gift_pool تم تعبئته) | ❌ | ❌ | ✅ | ❌ | ❌ |
| دفعة متأخرة (overdue payment_schedule) | ✅ | ✅ | ✅ (أنشأت الطلب) | ❌ | ❌ |
| تذكير reconciliation اليومي | ✅ | ✅ | ❌ | ❌ | ❌ |

## جدول `notification_preferences`

```
CHECK (channel IN ('in_app'))       -- D-22
UNIQUE (user_id, notification_type, channel)
```

- default: كل الإشعارات enabled لكل مستخدم.
- UI في `/settings/notifications` يعرض toggle لكل notification_type.

## Polling strategy (D-42)

### Notifications badge — on-demand

```ts
// كل API response عادية تُرجع header:
res.headers.set('X-Unread-Count', String(unreadCount));
// client middleware يقرأ الـ header ويحدِّث store محلي.
```
**الأثر**: لا polling مستقل للـ badge. المستخدم يرى العدد الجديد مع أي نداء API عادي.

### Bell Dropdown — on-open fetch

```ts
// src/hooks/useNotifications.ts
const { data } = useQuery({
  queryKey: ['notifications', userId],
  queryFn: () => fetch('/api/notifications?unread=true').then(r => r.json()),
  enabled: bellOpen, // يُجلَب فقط عند فتح الـ dropdown
  staleTime: 10_000, // 10s (جميع الحالات metaphors)
});
```

### DataTables — adaptive

```ts
// src/hooks/useAdaptivePolling.ts
const { data } = useQuery({
  queryKey: ['orders', filters],
  queryFn: fetchOrders,
  refetchInterval: isIdle ? 180_000 : 90_000,
  refetchIntervalInBackground: false,
});
// isIdle = true بعد 3 دقائق بلا mouse/keyboard
```

- **visibilityState** check: polling يتوقف عند تبديل التبويب.
- **interaction grace**: إذا المستخدم يكتب في حقل، polling يُخطَّى لحد 8s.

### Neon compute budget (D-42)

الحد السابق كان 20s polling × 20 user = **200h/أسبوع** (> حصة Neon Free 190h/**شهر**). السياسة الجديدة تُقدِّر ~30h/شهر — أمان كامل داخل الحصة.

## SSE — DEPRECATED (D-41)

~~endpoint `/api/notifications/stream`~~ محذوف. إذا احتاج المشروع push مستقبلاً: ترقية إلى Vercel Pro + Neon Scale **أو** استخدام Ably/Pusher free-tier كخدمة مستقلة.
