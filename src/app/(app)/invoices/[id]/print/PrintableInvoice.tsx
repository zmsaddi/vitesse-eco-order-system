import type { InvoiceDetailDto } from "@/modules/invoices/dto";

// Phase 5.5 — HTML render of a frozen invoice, for browser-print.
// Parallel channel to the pdfkit PDF route: same legal content (D-35
// mandatory mentions), same frozen data source, different render
// engine. Pure server component — no client interactivity, no hooks.

function statusLabel(status: string, avoirOfId: number | null): {
  label: string;
  bg: string;
  color: string;
} {
  if (status === "ملغي") {
    return { label: "ANNULÉE", bg: "#fee2e2", color: "#991b1b" };
  }
  if (avoirOfId !== null) {
    return { label: "AVOIR", bg: "#ede9fe", color: "#5b21b6" };
  }
  return { label: "FACTURE", bg: "#ecfdf5", color: "#065f46" };
}

function paymentMethodFr(pm: string): string {
  if (pm === "كاش") return "Espèces / À la livraison";
  if (pm === "بنك") return "Virement bancaire";
  if (pm === "آجل") return "Crédit (paiement différé)";
  return pm;
}

export function PrintableInvoice({ detail }: { detail: InvoiceDetailDto }) {
  const { invoice, lines, avoirParent } = detail;
  const vs = invoice.vendorSnapshot;
  const s = statusLabel(invoice.status, invoice.avoirOfId);
  const heading = invoice.avoirOfId !== null ? "AVOIR" : "FACTURE";

  return (
    <article className="print-invoice mx-auto max-w-3xl rounded border border-gray-200 bg-white p-8 text-sm text-gray-900 dark:border-gray-700 dark:bg-white">
      <header className="mb-6 flex items-start justify-between gap-6 border-b border-gray-300 pb-4">
        <div>
          <h1 className="text-3xl font-bold">{heading}</h1>
          <div className="mt-1 text-xs text-gray-600">
            N° {invoice.refCode}
          </div>
          {avoirParent && (
            <div className="mt-1 text-xs text-gray-700">
              Avoir de la facture {avoirParent.refCode} du {avoirParent.date}
            </div>
          )}
          <div className="mt-1 text-xs text-gray-600">
            Date de facturation : {invoice.date}
            {invoice.deliveryDate
              ? `   ·   Date de livraison : ${invoice.deliveryDate}`
              : null}
          </div>
        </div>
        <div
          className="rounded px-3 py-1 text-xs font-bold"
          style={{ backgroundColor: s.bg, color: s.color }}
        >
          {s.label}
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase text-gray-500">
            Vendeur
          </h2>
          <div className="space-y-0.5 text-xs">
            <div className="font-semibold">
              {vs.shopName} ({vs.shopLegalForm})
            </div>
            {vs.shopCapitalSocial && (
              <div>Capital social : {vs.shopCapitalSocial} €</div>
            )}
            <div>{vs.shopAddress}</div>
            <div>{vs.shopCity}</div>
            {vs.shopSiret && <div>SIRET : {vs.shopSiret}</div>}
            {vs.shopSiren && <div>SIREN : {vs.shopSiren}</div>}
            {vs.shopVatNumber && <div>N° TVA : {vs.shopVatNumber}</div>}
            {vs.shopRcsNumber && <div>{vs.shopRcsNumber}</div>}
            {vs.shopApe && <div>APE : {vs.shopApe}</div>}
            {vs.shopEmail && <div>{vs.shopEmail}</div>}
            {vs.shopWebsite && <div>{vs.shopWebsite}</div>}
          </div>
        </div>
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase text-gray-500">
            Client
          </h2>
          <div className="space-y-0.5 text-xs">
            <div className="font-semibold">{invoice.clientNameFrozen}</div>
            {invoice.clientAddressFrozen && (
              <div>{invoice.clientAddressFrozen}</div>
            )}
            {invoice.clientPhoneFrozen && (
              <div>Tél : {invoice.clientPhoneFrozen}</div>
            )}
            {invoice.clientEmailFrozen && (
              <div>{invoice.clientEmailFrozen}</div>
            )}
          </div>
        </div>
      </section>

      <section className="mb-6">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 px-2 py-1 text-left">
                Désignation
              </th>
              <th className="border border-gray-300 px-2 py-1 text-right">
                Qté
              </th>
              <th className="border border-gray-300 px-2 py-1 text-right">
                Prix Unit. HT
              </th>
              <th className="border border-gray-300 px-2 py-1 text-right">
                TVA %
              </th>
              <th className="border border-gray-300 px-2 py-1 text-right">
                TVA
              </th>
              <th className="border border-gray-300 px-2 py-1 text-right">
                Total HT
              </th>
              <th className="border border-gray-300 px-2 py-1 text-right">
                Total TTC
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="border border-gray-300 px-2 py-1">
                  {l.productNameFrozen}
                  {l.isGift ? " (CADEAU)" : ""}
                  {l.vinFrozen ? ` — VIN ${l.vinFrozen}` : ""}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  {l.quantity}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  {l.isGift
                    ? "0.00"
                    : (
                        Number(l.unitPriceTtcFrozen) /
                        (1 + Number(l.vatRateFrozen) / 100)
                      ).toFixed(2)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  {l.vatRateFrozen}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  {l.vatAmountFrozen}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  {l.htAmountFrozen}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  {l.lineTotalTtcFrozen}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6 ms-auto w-64 border border-gray-300 text-xs">
        <div className="flex justify-between border-b border-gray-200 px-2 py-1">
          <span>Sous-total HT</span>
          <span>{invoice.totalHtFrozen} €</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 px-2 py-1">
          <span>TVA ({invoice.vatRateFrozen}%)</span>
          <span>{invoice.tvaAmountFrozen} €</span>
        </div>
        <div className="flex justify-between bg-gray-50 px-2 py-1 font-bold">
          <span>TOTAL TTC</span>
          <span>{invoice.totalTtcFrozen} €</span>
        </div>
      </section>

      {invoice.paymentsHistory.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 text-xs font-bold uppercase text-gray-500">
            Historique des paiements
          </h2>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 px-2 py-1 text-left">Date</th>
                <th className="border border-gray-300 px-2 py-1 text-right">Montant</th>
                <th className="border border-gray-300 px-2 py-1 text-left">Méthode</th>
              </tr>
            </thead>
            <tbody>
              {invoice.paymentsHistory.map((p, i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1">{p.date}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">
                    {p.amount} €
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {paymentMethodFr(p.paymentMethod)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mb-6 space-y-1 text-xs text-gray-700">
        <div>Conditions d&apos;escompte : aucun</div>
        {vs.shopPenaltyRateAnnual && (
          <div>
            En cas de retard : pénalités = {vs.shopPenaltyRateAnnual}% annuel
            (taux légal BCE + 10 pts min.)
          </div>
        )}
        {vs.shopRecoveryFeeEur && (
          <div>
            Indemnité forfaitaire de recouvrement : {vs.shopRecoveryFeeEur} €
            (C. com L441-10 II)
          </div>
        )}
      </section>

      {(vs.shopIban || vs.shopBic) && (
        <section className="mb-6 rounded border border-gray-300 bg-gray-50 p-3 text-xs">
          {vs.shopIban && <div>IBAN : {vs.shopIban}</div>}
          {vs.shopBic && <div>BIC : {vs.shopBic}</div>}
        </section>
      )}

      <footer className="mt-8 border-t border-gray-300 pt-3 text-[10px] text-gray-500">
        {[vs.shopSiret && `SIRET ${vs.shopSiret}`, vs.shopSiren && `SIREN ${vs.shopSiren}`, vs.shopApe && `APE ${vs.shopApe}`, vs.shopRcsNumber]
          .filter(Boolean)
          .join(" · ")}
        {" · "}
        Ref {invoice.refCode}
      </footer>
    </article>
  );
}
