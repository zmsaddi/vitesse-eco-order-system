import PDFDocument from "pdfkit";
import type { InvoiceDetailDto, InvoiceLineDto } from "./dto";

// Phase 4.1 — minimal French invoice PDF renderer.
//
// Input is the frozen invoice + frozen lines as returned by getInvoiceById,
// plus the subset of D-35 settings captured by the caller. We deliberately do
// NOT re-read live tables here: the PDF is an export of the frozen snapshot,
// not a recomputation. BR-66: French-language only.
//
// No font files are shipped — we use PDFKit's built-in Helvetica which covers
// French accents via WinAnsi. Cairo / Arabic rendering is out of scope for
// Phase 4.1 (the invoice is French-only per BR-66 and 22_Print_Export.md).

export type InvoiceSettings = {
  shopName: string;
  shopLegalForm: string;
  shopSiret: string;
  shopSiren: string;
  shopApe: string;
  shopVatNumber: string;
  shopAddress: string;
  shopCity: string;
  shopEmail: string;
  shopWebsite: string;
  shopIban: string;
  shopBic: string;
  shopCapitalSocial: string;
  shopRcsCity: string;
  shopRcsNumber: string;
  shopPenaltyRateAnnual: string;
  shopRecoveryFeeEur: string;
};

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
  s: InvoiceSettings,
  x: number,
  y: number,
): void {
  doc.font("Helvetica-Bold").fontSize(11).text(s.shopName, x, y);
  doc.font("Helvetica").fontSize(9);
  const lines = [
    `${s.shopLegalForm} - Capital social ${s.shopCapitalSocial} €`,
    s.shopAddress,
    s.shopCity,
    `SIRET : ${s.shopSiret}${s.shopSiren ? `  |  SIREN : ${s.shopSiren}` : ""}`,
    `N° TVA : ${s.shopVatNumber}${s.shopApe ? `  |  APE : ${s.shopApe}` : ""}`,
    `${s.shopRcsNumber}`,
    s.shopEmail,
    s.shopWebsite,
  ].filter(Boolean);
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

function drawLegalFooter(
  doc: PDFKit.PDFDocument,
  s: InvoiceSettings,
  startY: number,
): void {
  doc.font("Helvetica-Bold").fontSize(9).text("Conditions de paiement", 50, startY);
  doc.font("Helvetica").fontSize(8);
  const lines = [
    "Conditions d'escompte : aucun.",
    `Pénalités de retard : ${s.shopPenaltyRateAnnual}% annuel (minimum BCE + 10 points).`,
    `Indemnité forfaitaire de recouvrement : ${s.shopRecoveryFeeEur} € (C. com. L441-10 II).`,
  ];
  for (const line of lines) {
    doc.text(line, 50, doc.y);
  }
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(9).text("Coordonnées bancaires", 50, doc.y);
  doc.font("Helvetica").fontSize(8);
  doc.text(`IBAN : ${s.shopIban}`, 50, doc.y);
  doc.text(`BIC : ${s.shopBic}`, 50, doc.y);
}

export function renderInvoicePdf(
  detail: InvoiceDetailDto,
  s: InvoiceSettings,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const inv = detail.invoice;

    doc.font("Helvetica-Bold").fontSize(20).text("FACTURE", 50, 50);
    doc.font("Helvetica").fontSize(11);
    doc.text(`N° ${inv.refCode}`, 50, 78);
    doc.text(`Date de facturation : ${inv.date}`, 50, 92);
    doc.text(
      `Date de livraison : ${inv.deliveryDate ?? "—"}`,
      50,
      106,
    );
    doc.text(`Mode de règlement : ${inv.paymentMethod}`, 50, 120);

    // Vendor (right side).
    drawVendorBlock(doc, s, 320, 50);

    // Client (below header, left column).
    drawClientBlock(doc, inv, 50, 160);

    // Items table starts after the taller of the two columns.
    const tableEndY = drawItemsTable(doc, detail.lines, 240);

    // Totals.
    const totalsEndY = drawTotalsBlock(doc, inv, tableEndY + 6);

    // Legal footer starts ~30pt below totals.
    drawLegalFooter(doc, s, totalsEndY + 24);

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
