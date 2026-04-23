# لوحة التحكم — Dashboard Requirements

> **رقم العنصر**: #25 | **المحور**: هـ | **الحالة**: مواصفات نهائية
> **Phase 5.3 correction (2026-04-23)**: الـ`dashboard:view` كما كانت تُوصَف سابقاً لكل الأدوار الستة **لم تُنفَّذ** كذلك في MVP. القرار الفعلي المشحون في 5.3: `/dashboard` + `GET /api/v1/dashboard` **مقصوران على pm/gm/manager**. الأدوار التشغيلية (seller/driver/stock_keeper) **لا dashboard مستقل** في MVP — تهبط مباشرة على شاشة المهام (per §Operational Roles أدناه).
> **Phase 5.5 closure note (2026-04-23)**: المُشحن فعلياً في 5.5 هو dark mode + empty states polish + printable invoice HTML + PWA minimal + CI hardening. **KPIs الشخصية كـheader cards على شاشة المهام للأدوار التشغيلية لم تُشحن** — الـinformation موجودة أصلاً عبر `/my-bonus` (seller/driver). إضافتها كـcards منفصلة تنتمي لـpost-launch polish tranche إن ظهر طلب حقيقي بعد الـMVP.
> **Phase 6.2 Action Hub shipped (2026-04-23)**: `/action-hub` + `GET /api/v1/action-hub` نُفِّذا فعلياً. الثلاث أقسام (urgentActions، recentActivity ≤ 5 صفوف، teamCounts) تعمل مع scope ديناميكي: pm/gm = `global`، manager = `team` (self + direct-report drivers). Reconciliation-due يُحتسَب كـ `manager_box.balance > 0 OR driver_custody.balance > 0` للنطاق الحالي (proxy — لا calendar per-user في MVP). Pending-cancellations = `orders.status='ملغي'` اليوم (same query used by dashboard teamCounts.openCancellations). رابط "عرض Dashboard الكامل" لم يُضَف في 6.2 (القسم موجود أصلاً في nav؛ زر صريح مؤجَّل لـtranche polish لاحق).
> **محتوى `/dashboard` يختلف بحسب الدور** عبر scope (pm/gm = global؛ manager = team — revenue + counts + outstandingDebts + treasury؛ netProfit + cashProfit = null للـmanager — pm/gm-only numbers).

---

## المبدأ (D-72 محدِّث — Post-Round-7)

**Role home يختلف حسب نوع الدور**:

| الدور | Home | النوع |
|-------|------|-------|
| seller | `/orders` | task-first (موجود أصلاً) |
| driver | `/driver-tasks` | task-first (موجود أصلاً) |
| stock_keeper | `/preparation` | task-first (موجود أصلاً) |
| manager | `/action-hub` | **Action Hub خفيف (D-72 — جديد)** |
| gm | `/action-hub` | **Action Hub خفيف (D-72 — جديد)** |
| pm | `/action-hub` | **Action Hub خفيف (D-72 — جديد)** |

**Dashboard الكامل (`/dashboard`)** يظل متاحاً لـ PM/GM/manager، لكن **ليس الصفحة الأولى**. يُفتَح من Action Hub عبر زر "عرض Dashboard الكامل".

---

## Action Hub لـ admin roles (D-72)

**مبدأ**: الصفحة الأولى للـ PM/GM/manager = "ماذا تحتاج فعل الآن؟"، ليس charts.

### المحتوى (3 أقسام فقط)

1. **إجراءات مُلحَّة** (top section — ما يحتاج قراراً من المستخدم):
   - Overdue payments (orders ≥ 7 أيام بلا تحصيل).
   - Reconciliation due today (manager/GM).
   - Pending cancellations needing approval.
   - Stale commission snapshots > 60 يوم (D-53).
   - Low stock products (count فقط — رابط لـ `/inventory`).
   - Settings incomplete (إذا D-35 mandatory mentions placeholders فارغة).
   - كل item = بطاقة مع CTA مباشر (لا navigation ضائع).

2. **آخر نشاط** (5 صفوف فقط):
   - آخر 5 عمليات من فريق المستخدم (manager = فريقه، pm/gm = كل النظام).
   - كل صف: user + action + entity + timestamp + رابط.

3. **حالة الفرق (counts فقط — لا charts)**:
   - Orders today: N
   - Deliveries pending: N
   - Low stock count: N
   - Open cancellations: N

### زر "عرض Dashboard الكامل"

يفتح `/dashboard` (الـ full dashboard أدناه) للـ deep analysis + charts + KPIs + فترات تاريخية.

**السبب (D-72)**: Dashboard الثقيل ممتاز للـ monthly review، لكنه **ليس** نقطة البداية اليومية. Action Hub يُوجِّه المستخدم للإجراء التالي فوراً.

---

## Dashboard الكامل (ثانوي، يُفتَح يدوياً من Action Hub)

---

### PM/GM Dashboard (العرض الكامل)

**بطاقات KPI:** الإيرادات، صافي الربح، الديون، الربح النقدي
**أرصدة الصناديق:** كل الصناديق (GM كاش + بنك + صناديق المدراء + عهدات السائقين)
**تبويبات:**
- ملخص سريع: P&L + تدفق نقدي
- تقارير: charts (مبيعات 6 أشهر، مصاريف دائرية، اتجاه أرباح)
- أعلى: المدينون، المنتجات، البائعون، الموردون
**إجراءات سريعة:** + طلب جديد، + مشتريات
**فلتر تاريخ** + تصدير CSV

---

### Manager Dashboard

**بطاقات KPI:** مبيعات الفترة، صندوقي، ديون عملائي
**أرصدة:** صندوقي فقط
**تبويبات:** ملخص عملياتي + أداء فريقي
**إجراءات سريعة:** + طلب، + مصروف

---

### Operational Roles (seller / driver / stock_keeper) — No Dashboard (D-72)

الأدوار التشغيلية **تهبط مباشرة على شاشة المهام** (task-first موجود أصلاً في [03_Modules_List.md:166-168](03_Modules_List.md#L166)):

- **seller** → `/orders` (قائمة طلباتي + زر "طلب جديد" بارز).
- **driver** → `/driver-tasks` (بطاقات المهام + CTA "تسليم الأموال" إن كان هناك عهدة مستحقة).
- **stock_keeper** → `/preparation` (طلبات بانتظار التحضير + تنبيهات نقص المخزون inline).

**لا dashboard منفصل** لهذه الأدوار في MVP (D-71 + D-72). KPIs شخصية (مبيعاتي، عمولاتي، مهامي اليوم) تظهر كـ **header cards** في أعلى شاشة المهام، ليس صفحة مستقلة.

**المبرر**: المستخدم التشغيلي يحتاج "المهمة التالية" فوراً. Dashboard منفصل = نقرة إضافية لفهم ما يجب فعله.
