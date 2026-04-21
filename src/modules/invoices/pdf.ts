import PDFDocument from "pdfkit";
import type {
  InvoiceDetailDto,
  InvoiceLineDto,
  PaymentsHistory,
  VendorSnapshot,
} from "./dto";
import { buildInvoiceHeaderLines } from "./pdf-header";

// Phase 4.1.1 — minimal French invoice PDF renderer, frozen-only inputs.
//
// Contract: the renderer reads ONLY the frozen invoice row (vendor block,
// totals, client, payments history) + invoice_lines. No live `settings`
// read, no live `payments` read. This is what 00_DECISIONS §PDF-render
// actually requires ("render يقرأ فقط من frozen columns وinvoice_lines"):
// once an invoice is issued, mutating `settings` cannot alter the PDF the
// authorities receive.
//
// No font files are shipped — we use PDFKit's built-in Helvetica which
// covers French accents via WinAnsi. Cairo / Arabic rendering is out of
// scope for Phase 4.1 (the invoice is French-only per BR-66).

const EUR = (s: string): string => {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return `${n.toFixed(2)} €`;
};

const QTY = (s: string): string => {
  const n = Number(s);
  return Number.isFinite(n) ? n.toString() : s;
};

function drawVendorBlock(
  doc: PDFKit.PDFDocument,
  v: VendorSnapshot,
  x: number,
  y: number,
): void {
  doc.font("Helvetica-Bold").fontSize(11).text(v.shopName, x, y);
  doc.font("Helvetica").fontSize(9);
  const lines = [
    `${v.shopLegalForm} - Capital social ${v.shopCapitalSocial} €`,
    v.shopAddress,
    v.shopCity,
    `SIRET : ${v.shopSiret}${v.shopSiren ? `  |  SIREN : ${v.shopSiren}` : ""}`,
    `N° TVA : ${v.shopVatNumber}${v.shopApe ? `  |  APE : ${v.shopApe}` : ""}`,
    v.shopRcsNumber,
    v.shopEmail,
    v.shopWebsite,
  ].filter((l) => l && l.trim().length > 0);
  for (const line of lines) {
    doc.text(line, x, doc.y);
  }
}

function drawClientBlock(
  doc: PDFKit.PDFDocument,
  inv: InvoiceDetailDto["invoice"],
  x: number,
  y: number,
): void {
  doc.font("Helvetica-Bold").fontSize(10).text("Client", x, y);
  doc.font("Helvetica").fontSize(10);
  const lines = [
    inv.clientNameFrozen,
    inv.clientAddressFrozen,
    inv.clientPhoneFrozen,
    inv.clientEmailFrozen,
  ].filter((l) => l && l.trim().length > 0);
  for (const line of lines) {
    doc.text(line, x, doc.y);
  }
}

function drawItemsTable(
  doc: PDFKit.PDFDocument,
  lines: InvoiceLineDto[],
  startY: number,
): number {
  const left = 50;
  const cols = {
    designation: left,
    qty: left + 260,
    puTtc: left + 310,
    ht: left + 380,
    tva: left + 440,
    ttc: left + 490,
  };
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Désignation", cols.designation, startY);
  doc.text("Qté", cols.qty, startY);
  doc.text("P.U. TTC", cols.puTtc, startY);
  doc.text("HT", cols.ht, startY);
  doc.text("TVA", cols.tva, startY);
  doc.text("TTC", cols.ttc, startY);
  doc
    .moveTo(left, startY + 12)
    .lineTo(540, startY + 12)
    .stroke();

  let y = startY + 18;
  doc.font("Helvetica").fontSize(9);
  for (const l of lines) {
    const name = l.isGift
      ? `${l.productNameFrozen}  (CADEAU)`
      : l.productNameFrozen;
    doc.text(name, cols.designation, y, { width: 255 });
    doc.text(QTY(l.quantity), cols.qty, y);
    doc.text(EUR(l.unitPriceTtcFrozen), cols.puTtc, y);
    doc.text(EUR(l.htAmountFrozen), cols.ht, y);
    doc.text(EUR(l.vatAmountFrozen), cols.tva, y);
    doc.text(EUR(l.lineTotalTtcFrozen), cols.ttc, y);
    y = Math.max(y + 16, doc.y + 4);
  }
  doc
    .moveTo(left, y)
    .lineTo(540, y)
    .stroke();
  return y + 8;
}

function drawTotalsBlock(
  doc: PDFKit.PDFDocument,
  inv: InvoiceDetailDto["invoice"],
  startY: number,
): number {
  const labelX = 380;
  const valueX = 490;
  doc.font("Helvetica").fontSize(10);
  doc.text("Sous-total HT", labelX, startY);
  doc.text(EUR(inv.totalHtFrozen), valueX, startY);
  doc.text(`TVA (${inv.vatRateFrozen} %)`, labelX, startY + 14);
  doc.text(EUR(inv.tvaAmountFrozen), valueX, startY + 14);
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text("TOTAL TTC", labelX, startY + 30);
  doc.text(EUR(inv.totalTtcFrozen), valueX, startY + 30);
  return startY + 50;
}

function drawPaymentHistoryBlock(
  doc: PDFKit.PDFDocument,
  paymentsHistory: PaymentsHistory,
  startY: number,
): number {
  if (paymentsHistory.length === 0) return startY;
  doc.font("Helvetica-Bold").fontSize(9).text("Historique des règlements", 50, startY);
  doc.font("Helvetica-Bold").fontSize(9);
  const left = 50;
  const cols = {
    date: left,
    method: left + 120,
    type: left + 240,
    amount: left + 420,
  };
  let y = startY + 14;
  doc.text("Date", cols.date, y);
  doc.text("Mode", cols.method, y);
  doc.text("Type", cols.type, y);
  doc.text("Montant", cols.amount, y);
  doc
    .moveTo(left, y + 12)
    .lineTo(540, y + 12)
    .stroke();
  y += 18;
  doc.font("Helvetica").fontSize(9);
  for (const p of paymentsHistory) {
    doc.text(p.date, cols.date, y);
    doc.text(p.paymentMethod, cols.method, y);
    doc.text(p.type, cols.type, y);
    doc.text(EUR(p.amount), cols.amount, y);
    y += 14;
  }
  return y + 6;
}

function drawLegalFooter(
  doc: PDFKit.PDFDocument,
  v: VendorSnapshot,
  startY: number,
): void {
  doc.font("Helvetica-Bold").fontSize(9).text("Conditions de paiement", 50, startY);
  doc.font("Helvetica").fontSize(8);
  const lines = [
    "Conditions d'escompte : aucun.",
    `Pénalités de retard : ${v.shopPenaltyRateAnnual}% annuel (minimum BCE + 10 points).`,
    `Indemnité forfaitaire de recouvrement : ${v.shopRecoveryFeeEur} € (C. com. L441-10 II).`,
  ];
  for (const line of lines) {
    doc.text(line, 50, doc.y);
  }
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(9).text("Coordonnées bancaires", 50, doc.y);
  doc.font("Helvetica").fontSize(8);
  doc.text(`IBAN : ${v.shopIban}`, 50, doc.y);
  doc.text(`BIC : ${v.shopBic}`, 50, doc.y);
}

/**
 * Render the invoice detail (header + frozen vendor + frozen payments + lines)
 * into a PDF buffer. Pure function of the detail DTO.
 */
export function renderInvoicePdf(detail: InvoiceDetailDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const inv = detail.invoice;
    const v = inv.vendorSnapshot;

    // Phase 4.5 — header varies between "FACTURE" and "AVOIR" + optional
    // parent reference line. The branch is computed by a pure helper
    // (buildInvoiceHeaderLines) with its own unit tests — see pdf-header.test.ts.
    const header = buildInvoiceHeaderLines(inv, detail.avoirParent);
    doc.font("Helvetica-Bold").fontSize(20).text(header.title, 50, 50);
    doc.font("Helvetica").fontSize(11);
    if (header.referenceLine) {
      doc.fontSize(9).text(header.referenceLine, 50, 74);
      doc.fontSize(11);
    }
    doc.text(`N° ${inv.refCode}`, 50, 90);
    doc.text(`Date de facturation : ${inv.date}`, 50, 104);
    doc.text(`Date de livraison : ${inv.deliveryDate ?? "—"}`, 50, 118);
    doc.text(`Mode de règlement : ${inv.paymentMethod}`, 50, 132);

    // Vendor (right side, frozen).
    drawVendorBlock(doc, v, 320, 50);

    // Client (below header, left column, frozen).
    drawClientBlock(doc, inv, 50, 160);

    // Items table.
    const tableEndY = drawItemsTable(doc, detail.lines, 240);

    // Totals.
    const totalsEndY = drawTotalsBlock(doc, inv, tableEndY + 6);

    // Payment history (frozen) — shown between totals and legal block when present.
    const paymentsEndY = drawPaymentHistoryBlock(
      doc,
      inv.paymentsHistory,
      totalsEndY + 16,
    );

    // Legal footer (frozen).
    drawLegalFooter(doc, v, paymentsEndY + 16);

    // Tiny meta footer at page bottom.
    doc.font("Helvetica").fontSize(7);
    doc.text(
      `Généré le ${new Date().toISOString()} — ${inv.refCode}`,
      50,
      780,
      { width: 495, align: "center" },
    );

    doc.end();
  });
}
