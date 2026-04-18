# متطلبات النظام الصوتي — Voice System Requirements

> **رقم العنصر**: #31 | **المحور**: ز | **الحالة**: مكتمل

---

## سير العمل الكامل

```
🎙️ التسجيل ──▶ 🔄 المعالجة ──▶ 📝 التأكيد ──▶ 💾 الحفظ ──▶ 🧠 التعلم
VoiceButton    /api/voice/process  VoiceConfirm   /api/sales etc.  /api/voice/learn
```

---

## 1. التسجيل (VoiceButton.js)

| المعلمة | القيمة |
|---------|--------|
| الحد الأدنى للتسجيل | 1500ms (BUG-28: منع الهلوسة من المقاطع الصامتة) |
| حد الصمت RMS | 0.02 (2% من المدى الكامل) |
| الإيقاف التلقائي | بعد 2.5 ثانية صمت |
| الحد الأدنى لحجم الملف | 500 bytes |
| واجهة الصوت | Web Audio API (RMS detector بالتوازي مع MediaRecorder) |

**رسائل الخطأ**:
- "التسجيل قصير جداً. الرجاء التحدث لمدة ثانية ونصف على الأقل"
- "التسجيل فارغ. حاول مرة أخرى"
- "لم أسمع شيئاً. تأكد من أن الميكروفون يعمل"
- "لا يمكن الوصول للميكروفون - تأكد من الصلاحيات"

---

## 2. المعالجة (/api/voice/process)

### تحديد المعدل (Rate Limiting)
- 10 طلبات/دقيقة لكل مستخدم
- خريطة في الذاكرة (تُمسح عند إعادة التشغيل)

### الخطوة 1: تحويل الكلام لنص (Whisper)
- **النموذج**: Groq Whisper Large v3
- **اللغة**: العربية
- **الـ Prompt**: ~150 حرف (أفعال الأولوية + أعلى المنتجات + أعلى العملاء)

### الخطوة 2: فلترة الهلوسة (BUG-28)
- **القائمة السوداء**: نصوص YouTube النمطية، "[موسيقى]"
- **الفحص**: على النص الخام (RAW)، ليس المُعالج
- **التحذير**: نصوص طويلة بدون أفعال إجراء → تحذير "مشبوه"

### الخطوة 3: استخراج LLM
- **النموذج**: Groq Llama-3.1-8b-instant
- **الحرارة**: 0.1 (دقة عالية)
- **الـ System Prompt** (242 سطر):
  - اسم المنتج يجب أن يكون بالإنجليزية
  - أنماط مُتعلمة (خاصة بالمستخدم 8 + عامة 7)
  - تصحيحات سابقة كأمثلة (few-shot)
  - خرائط الفئات والدفع

### الخطوة 4: مطابقة الكيانات (Entity Resolution)
- **العملاء**: fuzzy match → matched / ambiguous (عرض picker) / new
- **المنتجات**: fuzzy match → علم isNewProduct إذا لم يُوجد
- **الموردين**: نفس نمط العملاء
- **المكتبة**: Fuse.js مع cache

### الخطوة 5: تصنيف الإجراء
- أفعال صريحة ("بعت"/"اشتريت"/"مصروف") تتجاوز تصنيف LLM
- تصحيح تلقائي إذا اختلف التصنيف القائم على القواعد عن LLM

---

## 3. التأكيد (VoiceConfirm.js)

- عرض النص المُفرّغ والتحذيرات والحقول الناقصة
- **حدود صفراء** للحقول الناقصة (missing_fields)
- **فلترة حسب الدور**: register_sale (admin/manager/seller)، register_purchase (admin/manager)، register_expense (admin/manager)
- **تحقق BUG-30**: تنبيه إذا sell_price < buy_price
- **حماية الإرسال المزدوج**: flag `submitted`

---

## 4. التعلم (/api/voice/learn)

### الحقول القابلة للتعلم
payment_type, supplier, item, quantity, unit_price, sell_price, category, client_name, client_phone, client_address, description, amount

### آلية التعلم
1. **تصحيحات**: عندما يعدل المستخدم حقلًا → سجل في ai_corrections
2. **أنماط**: عندما يقبل المستخدم كل شيء بدون تعديل → زيادة frequency في ai_patterns
3. **أسماء مستعارة**: عند التصحيح → إنشاء alias في entity_aliases (عدة أنواع: ai_correction, speech_correction, english_canonical, auto_strip_al, transcript_word)
4. **إبطال Cache**: بعد إنشاء alias → إبطال Fuse cache

---

## 5. الجداول المستخدمة

| الجدول | الغرض | الأعمدة الرئيسية |
|--------|-------|-----------------|
| voice_logs | سجل كل تسجيل صوتي | transcript, normalized_text, action_type, status, action_id |
| ai_corrections | تصحيحات المستخدم للتعلم | transcript, ai_output, user_correction, field_name |
| ai_patterns | أنماط مُتعلمة للتعرف | spoken_text, correct_value, field_name, frequency, username |
| entity_aliases | أسماء مستعارة للكيانات | entity_type, entity_id, alias, normalized_alias, source |

---

## 6. الإجراءات المدعومة

| الإجراء | الأدوار | الوصف |
|---------|---------|-------|
| register_sale | admin, manager, seller | تسجيل بيع بالصوت |
| register_purchase | admin, manager | تسجيل مشترى بالصوت |
| register_expense | admin, manager | تسجيل مصروف بالصوت |
| clarification | الكل | LLM يحتاج توضيح |
