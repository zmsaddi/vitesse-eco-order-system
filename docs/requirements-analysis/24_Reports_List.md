# التقارير — Reports List

> **رقم العنصر**: #24 | **المحور**: هـ | **الحالة**: مواصفات نهائية
> **Phase 5.3 shipping status (2026-04-23)**: 6 تقارير مشحونة، 5 تقارير مؤجَّلة / خارج MVP. لا تُفترض قابلية التشغيل للتقارير المؤجَّلة — لم تُنفَّذ ولا endpoint ولا UI.

---

## Phase 5.3 — المشحون فعلاً (6 slugs)

| slug | الأدوار | Manager scope | Chart | مصدر البيانات |
|------|:------:|:-------------:|:-----:|---------------|
| `pnl` | PM / GM | — (403) | Bar | `payments`, `order_items`, `orders`, `expenses`, `bonuses`, `settlements` — صيغة §9 في 10_Calculation_Formulas.md |
| `revenue-by-day` | PM / GM / Manager | team-scoped (`orders.created_by ∈ self ∪ linked drivers`) | Line | `payments` — `SUM(amount)` per day |
| `top-clients-by-debt` | PM / GM | — (403) | Horizontal Bar | `orders + payments` — remaining > 0.01€، live snapshot، LIMIT 20 |
| `top-products-by-revenue` | PM / GM | — (403) | Horizontal Bar | `order_items + orders` — `SUM(line_total)` للطلبات المؤكَّدة في الفترة، LIMIT 20 |
| `expenses-by-category` | PM / GM | — (403) | Pie | `expenses` — groupBy `category` |
| `bonuses-by-user` | PM / GM / Manager | team-scoped (`bonuses.user_id ∈ self ∪ linked drivers`) | Horizontal Bar | `bonuses` — groupBy `user_id, role` |

- **API**: `GET /api/v1/reports/[slug]?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD` — invalid slug → 404 `REPORT_NOT_FOUND`، forbidden slug لدورٍ ما → 403.
- **UI**: `/reports` index + `/reports/[slug]` detail. الـindex يُصفَّى per role (manager لا يرى links لـ pm/gm-only slugs).
- **CSV export**: client-side فقط — الصفحة تبني CSV من الـpayload الموجود + تنزيل عبر Blob (UTF-8+BOM, `;` separator per D-22 M13). لا endpoint للـCSV.
- **Date filter**: default = current Paris month (first → today). `dateTo` inclusive.

## المواصفات الأصلية (11 تقرير) — حالة الشحن

| # | التقرير الأصلي | 5.3 status | مبرر |
|---|----------------|:----------:|-------|
| 1 | **P&L** (3 طرق) | ✅ shipped كـ`pnl` — Cash Basis فقط | Accrual + Pipeline يتطلبان بنية accrual لم تُشحن. Cash Basis يكفي لـMVP (معتمد من 25_Dashboard §netProfit). |
| 2 | **ربح لكل طلب** | ⏸️ **مؤجَّل** post-5.3 | يحتاج صفحة order-detail + UI per-order breakdown. §13 من 10_Calculation_Formulas.md يصف الصيغة؛ لم يُنفَّذ UI. |
| 3 | **أداء البائعين** | ⚠️ partial — `bonuses-by-user` يغطي الإجمالي فقط | ranking + cancel-rate + margin بحاجة حقول إضافية (metrics aggregation) — خارج نطاق 5.3. الـslug المشحون يُظهر `totalBonus` لكل مستخدم فقط. |
| 4 | **أرصدة الصناديق** | ✅ shipped كـ part من `/api/v1/dashboard.treasuryBalances` (ليس ضمن `/api/v1/reports/*`) | لا يحتاج page مستقلة — يعرضها Dashboard. Manager يرى نطاق صندوقه. |
| 5 | **تسوية يومية** | ⏸️ **مؤجَّل** — `/api/v1/treasury/reconcile` endpoint موجود منذ Phase 4.3، لكن لا UI | post-5.3 refinement |
| 6 | **تقييم المخزون** | ⏸️ **مؤجَّل** | لا UI. `products.stock × products.buy_price` — يمكن إضافته في Phase 5.5 polish لو لزم. |
| 7 | **مبيعات 6 أشهر** | ✅ shipped كـ`revenue-by-day` بدقة يومية | الـline chart يُظهر trend داخل الفترة؛ 6-month window يُختار بالـfilter. |
| 8 | **مصاريف دائرية** | ✅ shipped كـ`expenses-by-category` | 1-to-1. |
| 9 | **اتجاه الأرباح** | ⏸️ **مؤجَّل** | يمكن اشتقاقه من `pnl` + `revenue-by-day` على فترات متعاقبة؛ لا UI dedicated. |
| 10 | **أعلى المدينون** | ✅ shipped كـ`top-clients-by-debt` | 1-to-1. |
| 11 | **ديون الموردين** | ⏸️ **مؤجَّل** / خارج MVP | جدول `purchases` + payments للموردين موجود؛ لا UI في 5.3. |

**إضافة 5.3 خارج الـ11 الأصلية**: `top-products-by-revenue` — مفيد للإدارة لمعرفة المنتجات الأكثر تساهماً في الإيراد.

**الخلاصة**:
- **6 shipped** (5 منها تطابق 1-to-1 أو بتقريب واضح من الـ11 الأصلية، + 1 جديد).
- **5 مؤجَّل/خارج MVP** — موثَّق صراحة أعلاه مع مبرر لكل واحد. إعادة التفعيل تحتاج ترانش مستقلة لا تحت 5.3.

كل التقارير المشحونة تدعم date filter + CSV export (client-side).
