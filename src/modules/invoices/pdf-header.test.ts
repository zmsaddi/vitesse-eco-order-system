import { describe, expect, it } from "vitest";
import { buildInvoiceHeaderLines } from "./pdf-header";

// Phase 4.5 — deterministic proof that the PDF header branch emits
//   (A) "FACTURE" with no reference line for a regular invoice
//   (B) "AVOIR" + "Avoir de la facture <refCode> du <date>" for an avoir
// Runs in-process without pdfkit, closing the PDF proof path the reviewer
// required.

describe("buildInvoiceHeaderLines", () => {
  it("regular invoice → title=FACTURE + no reference line", () => {
    const res = buildInvoiceHeaderLines(
      { avoirOfId: null },
      null,
    );
    expect(res.title).toBe("FACTURE");
    expect(res.referenceLine).toBeNull();
  });

  it("regular invoice with a stray avoirParent → still FACTURE + no reference", () => {
    // avoirParent must only matter when avoirOfId != null. If a caller
    // accidentally supplies both, the null avoirOfId wins (regular invoice).
    const res = buildInvoiceHeaderLines(
      { avoirOfId: null },
      { refCode: "FAC-2026-04-0001", date: "2026-04-01" },
    );
    expect(res.title).toBe("FACTURE");
    expect(res.referenceLine).toBeNull();
  });

  it("avoir with parent → title=AVOIR + reference carries BOTH refCode and date", () => {
    const res = buildInvoiceHeaderLines(
      { avoirOfId: 42 },
      { refCode: "FAC-2026-04-0023", date: "2026-04-15" },
    );
    expect(res.title).toBe("AVOIR");
    // Both the parent refCode AND the parent date must be present, with the
    // exact French phrasing required by D-38 + 22_Print_Export.md.
    expect(res.referenceLine).toBe(
      "Avoir de la facture FAC-2026-04-0023 du 2026-04-15",
    );
    expect(res.referenceLine).toContain("FAC-2026-04-0023");
    expect(res.referenceLine).toContain("2026-04-15");
  });

  it("avoir with missing parent → defence label, not a throw", () => {
    // Defence-in-depth: an avoir whose parent lookup was missed should
    // still produce a renderable PDF. We accept a placeholder over a throw.
    const res = buildInvoiceHeaderLines({ avoirOfId: 42 }, null);
    expect(res.title).toBe("AVOIR");
    expect(res.referenceLine).toBe("Avoir de la facture — du —");
  });
});
