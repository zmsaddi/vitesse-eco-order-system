# Audit Report 5 — Post Phase 0b Residual Review

> **التاريخ**: 2026-04-19
> **النطاق**: مراجعة نتيجة Phase 0b المُعلَنة (بعد إصلاح Phase 0a-revisited)
> **النتيجة**: 7 تناقضات متبقية تُثبت أن "Phase 0b مكتملة" ادعاء سابق لأوانه

---

## 1. ادعاء اكتمال Phase 0b غير دقيق لأن قفل الحزم ما زال قديمًا ومخالفًا لـ package.json

00_execution_plan.md (line 46) يقول "كل النقاط أُصلحت"، و00_execution_plan.md (line 209) يقول إن package.json صار صحيحًا. فعليًا package.json صار `vitesse-eco` مع Node 24 و`ws` و`@types/ws` و`@types/node ^24`. لكن **package-lock.json ما زال يبدأ باسم `temp-init` ويثبت `@types/node: ^20` ولا يعكس `ws`/`@types/ws` في جذر الحزمة**. هذا ليس تفصيلًا؛ بل يعني أن "صدق الإعدادات" غير مكتمل.

---

## 2. الخطة التنفيذية تدّعي "37 ملف spec نهائي بلا تناقضات معروفة"، وهذا غير صحيح

الادعاء موجود في 00_execution_plan.md (line 212). لكن توجد تناقضات حية واضحة في ملفات المواصفات نفسها، لا في الهامش.

---

## 3. استراتيجية الخطوط ما زالت متناقضة بين الملفات

23_Navigation_UI.md (line 44) ما زال يقول "Cairo (Google Fonts via next/font)"، بينما القرار D-15 في 00_DECISIONS.md (line 326) وملخص الخطة في DEVELOPMENT_PLAN.md (line 36) وDEVELOPMENT_PLAN.md (line 45) حسموا الموضوع إلى `next/font/local`. هذا تناقض تنفيذي مباشر.

---

## 4. توقيت احتساب العمولة ما زال منقسمًا بين "لحظة التسليم" و"snapshot وقت الإنشاء"

13_Commission_Rules.md (line 26) يلغي M14 ويعتمد D-17: snapshot وقت الإنشاء. لكن 09_Business_Rules.md (line 84) ما زال ينص على "المعدل الساري عند التسليم"، وكذلك 15_Roles_Permissions.md (line 182). هذه ليست ملاحظة تحريرية؛ بل **تغيّر سلوك دفع العمولات نفسه**.

---

## 5. قاعدة تحديث الأسماء ما زالت منقسمة بين H4 القديمة وD-20 الجديد

30_Data_Integrity.md (line 92) يصرح أن H4/BR-49 أُلغيت وأن `*_name_cached` هو الأساس التاريخي. لكن 09_Business_Rules.md (line 121) ما زال يفرض "تحديث الاسم ذريًا"، و27_Audit_Log.md (line 80) و28_Edge_Cases.md (line 29) ما زالت مبنية على نفس الفرضية القديمة. هذا يضرب اتساق نموذج البيانات والتدقيق معًا.

---

## 6. تصميم rate limit للصوت ما زال متضاربًا بين in-memory Map وNeon table

DEVELOPMENT_PLAN.md (line 329) ما زال يحدد in-memory Map، وحتى فقرة المخاطر في DEVELOPMENT_PLAN.md (line 343) تناقش نفس الخيار. بالمقابل 17_Security_Requirements.md (line 50) و34_Technical_Notes.md (line 41) يحسمانها إلى جدول `voice_rate_limits` في Neon. **هذا تعارض بنيوي، لا مجرد wording**.

---

## 7. سجل القرار D-15 نفسه يناقض حالة المستودع الفعلية

القرار في 00_DECISIONS.md (line 326) يقول إن ملفات `.ttf` **"مُلتزمة"** داخل `public/fonts/cairo/`. لكن `public/fonts/cairo/README.md` (line 61) يقول صراحة إن ملفات `.ttf` "غير مُلتزمة بعد" وستُضاف في أول commit من Phase 0، والمجلد يحتوي فعليًا ملف README فقط. هذا يضعف حجية 00_DECISIONS.md كمرجع كنسي دقيق.

---

## 8. الوثائق ليست self-contained بالكامل لأنها تعتمد على تقارير خارجية غير موجودة داخل المستودع

أمثلة واضحة: 07_Workflows.md (line 246) يشير إلى Report 3 H7، و16_Data_Visibility.md (line 5) و17_Security_Requirements.md (line 50) و20_Validation_Rules.md (line 48) تشير إلى Report 1. **لا يوجد مجلد تقارير مكافئ داخل docs/**. هذا يجعل بعض التبريرات غير قابلة للتدقيق من داخل المستودع وحده.

---

## التحقق العملي

- `npm run build` يفشل لأن المشروع لا يحتوي app أو pages. هذا متسق مع 00_execution_plan.md (line 196) الذي يصرح أن الفشل متوقع الآن.
- `npm run lint` يخرج 0 لكنه يعطي warning عن غياب pages، لذلك اللون الأخضر هنا إشارة ضعيفة.
- `npm run typecheck` يمر، لكنه شبه فارغ لأن `src/` غير موجودة.
- `npm test` يفشل لأن لا توجد اختبارات، وهذا متسق مع 00_execution_plan.md (line 200).
- `npm ci` لم يُكمل بسبب فشل وصول للـ registry، لكن mismatch بين package.json (line 2) وpackage-lock.json (line 1) مثبت محليًا ولا يحتاج الشبكة لإثباته.

---

## الخلاصة

الوضع تحسَّن فعلًا مقارنة بالجولة السابقة: العدّ صار أوضح، وcron صار أقرب للاتساق، والخطة التنفيذية أصبحت أصدق بخصوص كون المستودع docs + config only. لكن ادعاء "الوثائق متسقة" ما زال سابقًا لأوانه. أكبر مشكلتين الآن:

1. **المرجعية التنفيذية** ما زالت غير منضبطة داخليًا في عدة قواعد مهمة.
2. **الصدق التشغيلي للإعدادات** لم يكتمل بسبب package-lock.json القديم وتناقض D-15 مع حالة الخطوط الفعلية.
