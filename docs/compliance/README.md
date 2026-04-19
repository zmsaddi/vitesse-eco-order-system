# Compliance — ملفات الامتثال القانوني الفرنسي

> **المرجع الحاكم**: [../requirements-analysis/00_DECISIONS.md](../requirements-analysis/00_DECISIONS.md) — D-37, D-39, D-36.
> **التاريخ**: 2026-04-19 (Phase 0c).
> **الحالة**: هياكل معتمدة، القيم الفعلية تُعبَّأ قبل go-live.

---

## الملفات في هذا المجلد

| الملف | الغرض | المرجع القانوني |
|-------|-------|----------------|
| [registre_traitements.md](registre_traitements.md) | سجل معالجات البيانات الشخصية (RGPD Art. 30) | RGPD art. 30 + CNIL guide 2022 |
| [attestation_editeur.md](attestation_editeur.md) | شهادة المطوِّر لقانون anti-fraude TVA 2018 | CGI art. 286-I-3° bis + loi 2015-1785 art. 88 |
| [fec_delegation.md](fec_delegation.md) | خطاب تعهُّد من expert-comptable بمسؤولية FEC | CGI art. L47 A-I + décret 2013-346 |

---

## المسؤوليات

- **PM (owner)**: يُوقِّع attestation éditeur ويتابع registre traitements.
- **Expert-comptable خارجي**: يُوقِّع fec_delegation + يتولى تصدير FEC لـ fisc عند الطلب.
- **CNIL référent**: PM (owner) — لا حاجة DPO رسمي لـ SAS صغيرة (D-48 — pending).

---

## الـ 4 Critères للـ loi anti-fraude TVA 2018 (D-37)

| Critère | التطبيق في المشروع |
|---------|-------------------|
| **Inaltérabilité** | hash chain على `invoices` + `invoice_lines` + `cancellations` + `activity_log` + triggers immutability + REVOKE DELETE (D-04 + D-37 + D-58) |
| **Sécurisation** | Auth.js v5 + Argon2id (D-40) + PII masking + HTTPS + session idle 30m (D-45) |
| **Conservation** | Soft-delete مطلق (D-04) + retention 10 سنوات (D-19) + backups weekly (D-43) |
| **Archivage** | Automated pg_dump weekly → Vercel Blob + monthly off-site (D-43) + FEC via expert-comptable (D-36) |
