# النظام الصوتي — Voice System

> **رقم العنصر**: #32 | **المحور**: ز | **الحالة**: قيد التحديث

---

## 6 مراحل

1. **التسجيل** (VoiceButton): ≥1500ms، RMS threshold، 2.5s auto-stop
2. **المعالجة** (/api/voice/process): Groq Whisper → نص → Llama LLM → استخراج كيانات
3. **التأكيد** (VoiceConfirm): عرض النتيجة + تحذيرات + حقول ناقصة
4. **الحفظ**: POST /api/orders أو /api/purchases أو /api/expenses
5. **التعلم** (/api/voice/learn): تسجيل التصحيحات + تعزيز الأنماط
6. **الأسماء البديلة**: entity_aliases → fuzzy match بـ Fuse.js (عتبة 0.4 — L6)

## تحديثات v2

- الصوت يدعم **طلبات متعددة الأصناف** (مثلاً: "بيع دراجة V20 وخوذة لأحمد")
- الأدوار المسموحة: pm, gm, manager, seller
- Rate limit: 10 طلبات/دقيقة لكل مستخدم (in-memory Map)
- لغة: العربية (ar)
- Blacklist + hallucination detection

## الجداول

- voice_logs, ai_corrections, ai_patterns, entity_aliases
- تفاصيل في 02_DB_Tree.md (جداول 34-36)
