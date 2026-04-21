import type { DbTx } from "@/db/client";
import { invoiceLines, invoices } from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-log";
import {
  canonicalJSON,
  computeHashChainLink,
  HASH_CHAIN_KEYS,
} from "@/lib/hash-chain";
import { round2 } from "@/lib/money";
import { validateD35Readiness } from "../d35-gate";
import {
  invoiceLineRowToDto,
  invoiceRowToDto,
} from "../mappers";
import { generateInvoiceRefCode } from "../ref-code";
import { readIssueSettings } from "../snapshots";
import type {
  IssueAvoirInput,
  IssueAvoirResult,
} from "../dto";
import {
  assertCanIssueAvoir,
  type AvoirClaims,
} from "./permissions";
import {
  lockExistingAvoirsForParent,
  lockInvoiceForUpdate,
  lockLinesForUpdate,
  sumExistingAvoirLinesPerParentLine,
  type LockedLineRow,
} from "./locks";

// Phase 4.5 — issue an Avoir (credit note) against an existing invoice.
//
// Contract (D-38 + this tranche's governing decisions §10):
//   - pm/gm only (assertCanIssueAvoir at top).
//   - D-35 readiness runs first — same legal-completeness gate as regular
//     invoices.
//   - Parent invoice locked FOR UPDATE. Must be status='مؤكد' AND
//     avoir_of_id IS NULL (no avoir-on-avoir).
//   - Every requested line must belong to the parent.
//   - Cumulative credited quantity per line (across all prior avoirs for
//     the same parent, also locked) + new request ≤ parent.quantity.
//   - Ref-code shares the invoice monthly sequence (FAC-YYYY-MM-NNNN).
//   - Snapshots:
//       * client + payment-method + seller/driver/order/delivery refs
//         mirror the parent (the avoir is anchored to the same client and
//         the same commercial context — no re-fetch from live tables).
//       * vendorSnapshot taken from CURRENT settings via readIssueSettings,
//         because the legal vendor block on the day of the avoir is what
//         the authority expects.
//       * vat_rate frozen on the parent is authoritative for the avoir's
//         VAT extraction — the avoir reverses the very same VAT the parent
//         declared.
//   - Totals signed negative: totalTtcFrozen, totalHtFrozen, tvaAmountFrozen
//     all < 0 (enforced by CHECK constraint + service arithmetic).
//   - Per-line quantity + line_total_ttc negative.
//   - hash chain: parent chain unchanged. New avoir row appended to the
//     invoices chain; avoir lines appended to the invoice_lines chain.
//   - NO treasury_movement at issue time (bookkeeping-only, by directive).
//   - activity_log inside the same tx.

const TOLERANCE = 0.005;

export async function performIssueAvoir(
  tx: DbTx,
  parentInvoiceId: number,
  input: IssueAvoirInput,
  claims: AvoirClaims,
): Promise<IssueAvoirResult> {
  assertCanIssueAvoir(claims);

  // 1. Legal-completeness gate. Same rule as regular invoice issuance.
  await validateD35Readiness(tx);

  // 2. Lock the parent FOR UPDATE. 404 when missing or soft-deleted.
  const parent = await lockInvoiceForUpdate(tx, parentInvoiceId);
  if (!parent) {
    throw new NotFoundError(`الفاتورة رقم ${parentInvoiceId}`);
  }

  // 3. Status gate — only confirmed, non-avoir parents accept an avoir.
  if (parent.status !== "مؤكد") {
    throw new ConflictError(
      `لا يمكن إصدار Avoir لفاتورة بحالة "${parent.status}".`,
      "INVOICE_NOT_ISSUABLE_AVOIR",
      { parentInvoiceId, parentStatus: parent.status },
    );
  }
  if (parent.avoirOfId != null) {
    throw new ConflictError(
      "لا يمكن إصدار Avoir على Avoir آخر.",
      "AVOIR_ON_AVOIR_NOT_ALLOWED",
      { parentInvoiceId },
    );
  }

  // 4. Lock parent lines + existing avoir children + their lines so
  // concurrent callers serialize on the same (parent, line) key.
  const parentLines = await lockLinesForUpdate(tx, parentInvoiceId);
  await lockExistingAvoirsForParent(tx, parentInvoiceId);
  const alreadyCreditedByLineNumber = await sumExistingAvoirLinesPerParentLine(
    tx,
    parentInvoiceId,
  );

  // 5. Validate the input line set.
  //    - every requested invoiceLineId belongs to the parent
  //    - no duplicates within the input
  //    - each quantityToCredit <= remaining on that line
  const parentLineById = new Map(parentLines.map((l) => [l.id, l]));
  const seenLineIds = new Set<number>();
  type AvoirLinePlan = {
    parentLine: LockedLineRow;
    quantityToCredit: number; // positive input
  };
  const plan: AvoirLinePlan[] = [];

  for (const req of input.lines) {
    if (seenLineIds.has(req.invoiceLineId)) {
      throw new BusinessRuleError(
        "قائمة سطور الـ Avoir غير صحيحة — معرِّف سطر مُكرَّر.",
        "INVALID_AVOIR_LINE_SET",
        400,
        "performIssueAvoir: duplicate invoiceLineId in input",
        { duplicateId: req.invoiceLineId },
      );
    }
    seenLineIds.add(req.invoiceLineId);

    const parentLine = parentLineById.get(req.invoiceLineId);
    if (!parentLine) {
      throw new BusinessRuleError(
        "قائمة سطور الـ Avoir غير صحيحة — سطر لا ينتمي إلى الفاتورة.",
        "INVALID_AVOIR_LINE_SET",
        400,
        "performIssueAvoir: invoiceLineId not in parent invoice",
        { invoiceLineId: req.invoiceLineId, parentInvoiceId },
      );
    }

    const parentQty = Number(parentLine.quantity);
    const alreadyCredited =
      alreadyCreditedByLineNumber.get(parentLine.lineNumber) ?? 0;
    const remaining = round2(parentQty - alreadyCredited);
    const requested = round2(req.quantityToCredit);
    if (requested > remaining + TOLERANCE) {
      throw new ConflictError(
        `الكمية المطلوبة (${requested.toFixed(2)}) تتجاوز المتبقي القابل للاسترداد (${remaining.toFixed(2)}) على الصنف ${parentLine.lineNumber}.`,
        "AVOIR_QTY_EXCEEDS_REMAINING",
        {
          invoiceLineId: req.invoiceLineId,
          lineNumber: parentLine.lineNumber,
          parentQuantity: parentQty,
          alreadyCredited,
          remaining,
          requested,
        },
      );
    }

    plan.push({ parentLine, quantityToCredit: requested });
  }

  // 6. Fetch current settings for vendorSnapshot (legal block at the moment
  //    of the avoir). VAT rate is taken from the parent snapshot (avoir
  //    reverses the original VAT at the original rate).
  const { vendorSnapshot } = await readIssueSettings(tx);
  const parentVatRate = Number(parent.vatRateFrozen);
  if (!Number.isFinite(parentVatRate) || parentVatRate < 0) {
    throw new BusinessRuleError(
      "معدل VAT مُجمَّد على الفاتورة الأصل غير صالح.",
      "INVOICE_TOTAL_MISMATCH",
      500,
      "performIssueAvoir: parent vat_rate_frozen invalid",
      { parentInvoiceId, parentVatRate: parent.vatRateFrozen },
    );
  }

  // 7. Compute avoir line values (signed negative) and aggregate totals.
  const avoirDate = parent.date; // same booking period as the parent
  const avoirLines = plan.map(({ parentLine, quantityToCredit }) => {
    const parentQty = Number(parentLine.quantity);
    const parentLineTotalTtc = Number(parentLine.lineTotalTtcFrozen);
    // Preserve unit-price-TTC from parent; new line total = unitPrice * qty.
    const unitPriceTtc =
      parentQty > 0 ? round2(parentLineTotalTtc / parentQty) : 0;
    const avoirLineTotalTtc = round2(-unitPriceTtc * quantityToCredit);
    const avoirVatAmount = round2(
      (avoirLineTotalTtc * parentVatRate) / (100 + parentVatRate),
    );
    const avoirHtAmount = round2(avoirLineTotalTtc - avoirVatAmount);
    return {
      lineNumber: parentLine.lineNumber,
      productNameFrozen: parentLine.productNameFrozen,
      quantity: (-quantityToCredit).toFixed(2),
      unitPriceTtcFrozen: unitPriceTtc.toFixed(2),
      lineTotalTtcFrozen: avoirLineTotalTtc.toFixed(2),
      vatRateFrozen: parentVatRate.toFixed(2),
      vatAmountFrozen: avoirVatAmount.toFixed(2),
      htAmountFrozen: avoirHtAmount.toFixed(2),
      isGift: parentLine.isGift,
      vinFrozen: parentLine.vinFrozen ?? "",
    };
  });

  const totalTtc = round2(
    avoirLines.reduce((s, l) => s + Number(l.lineTotalTtcFrozen), 0),
  );
  const totalVat = round2(
    avoirLines.reduce((s, l) => s + Number(l.vatAmountFrozen), 0),
  );
  const totalHt = round2(totalTtc - totalVat);

  if (totalTtc >= 0) {
    throw new BusinessRuleError(
      "مجموع الـ Avoir يجب أن يكون سالباً.",
      "INVALID_AVOIR_LINE_SET",
      500,
      "performIssueAvoir: computed totalTtc is non-negative (defence)",
      { totalTtc },
    );
  }

  // 8. Generate ref-code (shared FAC-YYYY-MM-NNNN sequence — D-38).
  const refCode = await generateInvoiceRefCode(tx);

  // 9. Hash chain link on the new avoir row. canonical covers the avoir's
  // frozen identity (same column set as regular invoice issuance so the
  // chain verifier in chain.ts handles avoir rows without a special case).
  const canonical = canonicalJSON({
    avoirOfId: parentInvoiceId,
    clientAddress: parent.clientAddressFrozen ?? "",
    clientEmail: parent.clientEmailFrozen ?? "",
    clientName: parent.clientNameFrozen,
    clientPhone: parent.clientPhoneFrozen ?? "",
    date: avoirDate,
    deliveryDate: parent.deliveryDate,
    deliveryId: parent.deliveryId,
    driverName: parent.driverNameFrozen ?? "",
    lines: avoirLines,
    orderId: parent.orderId,
    paymentMethod: parent.paymentMethod,
    paymentsHistory: [], // avoirs do not carry the parent's payment trail
    refCode,
    sellerName: parent.sellerNameFrozen ?? "",
    status: "مؤكد",
    totalHt: totalHt.toFixed(2),
    totalTtc: totalTtc.toFixed(2),
    tvaAmount: totalVat.toFixed(2),
    vatRate: parentVatRate.toFixed(2),
    vendorSnapshot,
  });
  const { prevHash, rowHash } = await computeHashChainLink(
    tx,
    { chainLockKey: HASH_CHAIN_KEYS.invoices, tableName: "invoices" },
    canonical,
  );

  const inserted = await tx
    .insert(invoices)
    .values({
      refCode,
      date: avoirDate,
      deliveryDate: parent.deliveryDate,
      orderId: parent.orderId,
      deliveryId: parent.deliveryId,
      avoirOfId: parentInvoiceId,
      clientNameFrozen: parent.clientNameFrozen,
      clientPhoneFrozen: parent.clientPhoneFrozen ?? "",
      clientEmailFrozen: parent.clientEmailFrozen ?? "",
      clientAddressFrozen: parent.clientAddressFrozen ?? "",
      paymentMethod: parent.paymentMethod,
      sellerNameFrozen: parent.sellerNameFrozen ?? "",
      driverNameFrozen: parent.driverNameFrozen ?? "",
      totalTtcFrozen: totalTtc.toFixed(2),
      totalHtFrozen: totalHt.toFixed(2),
      tvaAmountFrozen: totalVat.toFixed(2),
      vatRateFrozen: parentVatRate.toFixed(2),
      vendorSnapshot,
      paymentsHistory: [],
      prevHash,
      rowHash,
      status: "مؤكد",
    })
    .returning();
  const avoirRow = inserted[0];

  // 10. Per-line chain + insert.
  const insertedLines: LockedLineRow[] = [];
  for (const l of avoirLines) {
    const lineCanonical = canonicalJSON({
      htAmountFrozen: l.htAmountFrozen,
      invoiceId: avoirRow.id,
      isGift: l.isGift,
      lineNumber: l.lineNumber,
      lineTotalTtcFrozen: l.lineTotalTtcFrozen,
      productNameFrozen: l.productNameFrozen,
      quantity: l.quantity,
      unitPriceTtcFrozen: l.unitPriceTtcFrozen,
      vatAmountFrozen: l.vatAmountFrozen,
      vatRateFrozen: l.vatRateFrozen,
      vinFrozen: l.vinFrozen,
    });
    const linkPair = await computeHashChainLink(
      tx,
      {
        chainLockKey: HASH_CHAIN_KEYS.invoice_lines,
        tableName: "invoice_lines",
      },
      lineCanonical,
    );
    const insertedLine = await tx
      .insert(invoiceLines)
      .values({
        invoiceId: avoirRow.id,
        lineNumber: l.lineNumber,
        productNameFrozen: l.productNameFrozen,
        quantity: l.quantity,
        unitPriceTtcFrozen: l.unitPriceTtcFrozen,
        lineTotalTtcFrozen: l.lineTotalTtcFrozen,
        vatRateFrozen: l.vatRateFrozen,
        vatAmountFrozen: l.vatAmountFrozen,
        htAmountFrozen: l.htAmountFrozen,
        isGift: l.isGift,
        vinFrozen: l.vinFrozen,
        prevHash: linkPair.prevHash,
        rowHash: linkPair.rowHash,
      })
      .returning();
    insertedLines.push(insertedLine[0]);
  }

  // 11. Activity log — same tx.
  await logActivity(tx, {
    action: "create",
    entityType: "invoices",
    entityId: avoirRow.id,
    userId: claims.userId,
    username: claims.username,
    details: {
      kind: "avoir",
      parentInvoiceId,
      parentRefCode: parent.refCode,
      reason: input.reason,
      linesCredited: plan.map((p) => ({
        lineNumber: p.parentLine.lineNumber,
        quantityToCredit: p.quantityToCredit,
      })),
      totalTtc,
      totalHt,
      totalVat,
      refCode,
    },
  });

  // Re-fetch via mapper — keeps DTO shape consistent with GET /invoices/:id.
  // We already have the fully-inserted rows; just map them.
  return {
    avoir: invoiceRowToDto(avoirRow),
    lines: insertedLines.map(invoiceLineRowToDto),
    parentInvoiceId,
    parentRefCode: parent.refCode,
  };
}

