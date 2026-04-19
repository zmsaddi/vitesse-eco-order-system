import { round2 } from "./money";

// D-02 + D-30: TVA غير مخزَّنة قبل إصدار الفاتورة (مرحلياً محسوبة)،
// ومُجمَّدة في `invoice_lines` + `invoices.*_frozen` بعد الإصدار (inaltérabilité — loi anti-fraude 2018).
//
// هذا الـ module يغطي الحالة الأولى (قبل الإصدار): محسوبة من TTC + vat_rate.

/**
 * From total TTC → extract TVA amount.
 * Formula: ttc × rate / (100 + rate)
 */
export function tvaFromTtc(ttc: number, ratePct: number): number {
  if (ratePct < 0 || ratePct > 100) {
    throw new Error(`tva: invalid rate ${ratePct}% (must be 0..100)`);
  }
  return round2((ttc * ratePct) / (100 + ratePct));
}

/**
 * From total TTC → extract HT (pre-tax) amount.
 */
export function htFromTtc(ttc: number, ratePct: number): number {
  return round2(ttc - tvaFromTtc(ttc, ratePct));
}

/**
 * From HT → compute TTC.
 */
export function ttcFromHt(ht: number, ratePct: number): number {
  return round2(ht * (1 + ratePct / 100));
}

export type TvaBreakdown = {
  totalTtc: number;
  totalHt: number;
  tvaAmount: number;
  vatRate: number;
};

/**
 * Build full breakdown for invoice PDF render (before freeze).
 * يُستخدَم فقط في الحالة المرحلية (قبل POST /api/v1/invoices).
 * بعد الإصدار، القيم المجمَّدة في invoices.*_frozen هي المصدر.
 */
export function breakdown(ttc: number, ratePct: number): TvaBreakdown {
  const tvaAmount = tvaFromTtc(ttc, ratePct);
  const totalHt = round2(ttc - tvaAmount);
  return {
    totalTtc: round2(ttc),
    totalHt,
    tvaAmount,
    vatRate: ratePct,
  };
}
