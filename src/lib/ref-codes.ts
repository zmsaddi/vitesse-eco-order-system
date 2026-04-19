// D-01 + BR-67 + BR-68: ترقيم المراجع.
// Phase 0: helpers لصيغة الـ refs فقط. الـ atomic sequence generation يتم داخل withTx في Phase 3+.

import { today } from "./date";

const pad = (n: number, width: number): string =>
  n.toString().padStart(width, "0");

/**
 * ORD-YYYYMMDD-NNNNN — order ref.
 */
export function orderRef(sequence: number): string {
  return `ORD-${today().replace(/-/g, "")}-${pad(sequence, 5)}`;
}

/**
 * PU-YYYYMMDD-NNNNN — purchase ref.
 */
export function purchaseRef(sequence: number): string {
  return `PU-${today().replace(/-/g, "")}-${pad(sequence, 5)}`;
}

/**
 * DL-YYYYMMDD-NNNNN — delivery ref.
 */
export function deliveryRef(sequence: number): string {
  return `DL-${today().replace(/-/g, "")}-${pad(sequence, 5)}`;
}

/**
 * FAC-YYYY-MM-NNNN — invoice ref (D-01).
 * Year+month sequence (monthly reset). Used for both facture + avoir (D-38).
 */
export function invoiceRef(year: number, month: number, sequence: number): string {
  return `FAC-${year}-${pad(month, 2)}-${pad(sequence, 4)}`;
}
