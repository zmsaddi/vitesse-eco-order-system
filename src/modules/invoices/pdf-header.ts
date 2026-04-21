import type { AvoirParent, InvoiceDto } from "./dto";

// Phase 4.5 — pure helper extracted from `renderInvoicePdf` so the avoir
// conditional branch is unit-testable without spinning up pdfkit.
//
// Behaviour:
//   - Regular invoice (avoirOfId == null): title is "FACTURE", no reference line.
//   - Avoir (avoirOfId != null): title is "AVOIR", and the reference line
//     reads "Avoir de la facture <parentRefCode> du <parentDate>".
//
// Guarantee: when avoirOfId is non-null the caller MUST supply `avoirParent`
// (the GET invoice service does the LEFT JOIN and populates it). If the
// caller passes null for an avoir row, we fall back to a minimal "AVOIR"
// label with a placeholder "—" reference so the PDF still renders rather
// than throwing — but this is a defence-in-depth path that the service
// should never hit under normal flow.

export type InvoiceHeaderLines = {
  title: "FACTURE" | "AVOIR";
  referenceLine: string | null;
};

export function buildInvoiceHeaderLines(
  invoice: Pick<InvoiceDto, "avoirOfId">,
  avoirParent: AvoirParent | null,
): InvoiceHeaderLines {
  if (invoice.avoirOfId == null) {
    return { title: "FACTURE", referenceLine: null };
  }
  if (avoirParent == null) {
    // Defence-in-depth: an avoir row whose parent lookup was missed.
    return {
      title: "AVOIR",
      referenceLine: "Avoir de la facture — du —",
    };
  }
  return {
    title: "AVOIR",
    referenceLine: `Avoir de la facture ${avoirParent.refCode} du ${avoirParent.date}`,
  };
}
