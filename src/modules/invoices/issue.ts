import { and, asc, eq, isNull } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import {
  clients,
  invoiceLines,
  invoices,
  orderItems,
  orders,
  settings,
  users,
} from "@/db/schema";
import { BusinessRuleError } from "@/lib/api-errors";
import {
  canonicalJSON,
  computeHashChainLink,
  HASH_CHAIN_KEYS,
} from "@/lib/hash-chain";
import { generateInvoiceRefCode } from "./ref-code";

// Phase 4.1 — issue an invoice inside an existing confirm-delivery transaction.
//
// Contract:
//   - caller holds FOR UPDATE on the parent order + delivery
//   - caller has already run validateD35Readiness(tx) at the top of the tx
//   - confirmDate is the Paris ISO "YYYY-MM-DD" already computed in confirm.ts
//
// Side effects (all within the caller's tx):
//   1. invoice_sequence atomic counter → ref_code FAC-YYYY-MM-NNNN
//   2. 1 row in invoices (frozen snapshot + hash chain link)
//   3. N rows in invoice_lines (one per order item, gifts preserved with 0€)
//
// Totals: TTC is the source of truth per BR-46. VAT is extracted from TTC using
// the snapshot `vat_rate_frozen` captured at issue from settings.vat_rate.

export type IssueInvoiceArgs = {
  orderId: number;
  deliveryId: number;
  confirmDate: string; // Paris YYYY-MM-DD — reused from confirm.ts
  sellerUsername: string;
  driverUsername: string;
};

export type IssuedInvoice = { id: number; refCode: string };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function readVatRate(tx: DbTx): Promise<number> {
  const rows = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "vat_rate"))
    .limit(1);
  if (rows.length === 0) {
    throw new BusinessRuleError(
      "إعداد vat_rate مفقود.",
      "D35_READINESS_INCOMPLETE",
      412,
      "settings.vat_rate missing at invoice issue — D-35 gate should have caught this",
      { missing: ["vat_rate"] },
    );
  }
  const n = Number(rows[0].value);
  if (!Number.isFinite(n) || n < 0) {
    throw new BusinessRuleError(
      `قيمة vat_rate غير صالحة (${rows[0].value}).`,
      "D35_READINESS_INCOMPLETE",
      412,
      `settings.vat_rate is not a non-negative number: ${rows[0].value}`,
      { key: "vat_rate", raw: rows[0].value },
    );
  }
  return n;
}

async function readOrderHeader(tx: DbTx, orderId: number) {
  const rows = await tx
    .select({
      id: orders.id,
      clientId: orders.clientId,
      totalAmount: orders.totalAmount,
      paymentMethod: orders.paymentMethod,
      createdBy: orders.createdBy,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (rows.length === 0) {
    throw new BusinessRuleError(
      `الطلب رقم ${orderId} غير موجود عند الإصدار.`,
      "INVOICE_ORDER_MISSING",
      500,
      "issueInvoiceInTx: parent order vanished mid-tx",
      { orderId },
    );
  }
  return rows[0];
}

async function readClientSnapshot(tx: DbTx, clientId: number) {
  const rows = await tx
    .select({
      name: clients.name,
      phone: clients.phone,
      email: clients.email,
      address: clients.address,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (rows.length === 0) {
    throw new BusinessRuleError(
      `العميل رقم ${clientId} غير موجود.`,
      "INVOICE_CLIENT_MISSING",
      500,
      "issueInvoiceInTx: client vanished mid-tx",
      { clientId },
    );
  }
  return rows[0];
}

async function readUserName(
  tx: DbTx,
  by: { username?: string; userId?: number },
): Promise<string> {
  if (by.username) {
    const rows = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.username, by.username))
      .limit(1);
    return rows[0]?.name ?? by.username;
  }
  if (by.userId !== undefined) {
    const rows = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, by.userId))
      .limit(1);
    return rows[0]?.name ?? "";
  }
  return "";
}

export async function issueInvoiceInTx(
  tx: DbTx,
  args: IssueInvoiceArgs,
): Promise<IssuedInvoice> {
  const vatRate = await readVatRate(tx);
  const order = await readOrderHeader(tx, args.orderId);
  const client = await readClientSnapshot(tx, order.clientId);
  const sellerName = await readUserName(tx, { username: args.sellerUsername });
  const driverName = args.driverUsername
    ? await readUserName(tx, { username: args.driverUsername })
    : "";

  const itemRows = await tx
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, args.orderId), isNull(orderItems.deletedAt)))
    .orderBy(asc(orderItems.id));
  if (itemRows.length === 0) {
    throw new BusinessRuleError(
      "لا يمكن إصدار فاتورة لطلب بلا أصناف.",
      "INVOICE_NO_ITEMS",
      409,
      "issueInvoiceInTx: order has no active items",
      { orderId: args.orderId },
    );
  }

  // Per-line VAT extraction from TTC totals (BR-46 + D-30).
  const lineFrozen = itemRows.map((item, idx) => {
    const lineTotalTtc = round2(Number(item.lineTotal));
    const vatAmount = round2((lineTotalTtc * vatRate) / (100 + vatRate));
    const htAmount = round2(lineTotalTtc - vatAmount);
    const qty = Number(item.quantity);
    const unitPriceTtc = qty > 0 ? round2(lineTotalTtc / qty) : 0;
    return {
      lineNumber: idx + 1,
      productNameFrozen: item.productNameCached,
      quantity: item.quantity,
      unitPriceTtcFrozen: unitPriceTtc.toFixed(2),
      lineTotalTtcFrozen: lineTotalTtc.toFixed(2),
      vatRateFrozen: vatRate.toFixed(2),
      vatAmountFrozen: vatAmount.toFixed(2),
      htAmountFrozen: htAmount.toFixed(2),
      isGift: item.isGift,
      vinFrozen: item.vin ?? "",
    };
  });

  // Sum lines; keep the header total_ttc == order.total_amount (authoritative).
  const sumFromLines = round2(
    lineFrozen.reduce((s, l) => s + Number(l.lineTotalTtcFrozen), 0),
  );
  const totalTtc = round2(Number(order.totalAmount));
  if (Math.abs(sumFromLines - totalTtc) > 0.005) {
    throw new BusinessRuleError(
      `اختلال مجاميع الفاتورة (${sumFromLines.toFixed(2)} vs ${totalTtc.toFixed(2)}).`,
      "INVOICE_TOTAL_MISMATCH",
      500,
      "issueInvoiceInTx: sum(lines.lineTotal) != orders.total_amount",
      { sumFromLines, totalTtc, orderId: args.orderId },
    );
  }
  const totalVat = round2((totalTtc * vatRate) / (100 + vatRate));
  const totalHt = round2(totalTtc - totalVat);

  const refCode = await generateInvoiceRefCode(tx);

  const canonical = canonicalJSON({
    avoirOfId: null,
    clientAddress: client.address ?? "",
    clientEmail: client.email ?? "",
    clientName: client.name,
    clientPhone: client.phone ?? "",
    date: args.confirmDate,
    deliveryDate: args.confirmDate,
    deliveryId: args.deliveryId,
    driverName,
    lineCount: lineFrozen.length,
    orderId: args.orderId,
    paymentMethod: order.paymentMethod,
    refCode,
    sellerName,
    totalHt: totalHt.toFixed(2),
    totalTtc: totalTtc.toFixed(2),
    tvaAmount: totalVat.toFixed(2),
    vatRate: vatRate.toFixed(2),
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
      date: args.confirmDate,
      deliveryDate: args.confirmDate,
      orderId: args.orderId,
      deliveryId: args.deliveryId,
      avoirOfId: null,
      clientNameFrozen: client.name,
      clientPhoneFrozen: client.phone ?? "",
      clientEmailFrozen: client.email ?? "",
      clientAddressFrozen: client.address ?? "",
      paymentMethod: order.paymentMethod,
      sellerNameFrozen: sellerName,
      driverNameFrozen: driverName,
      totalTtcFrozen: totalTtc.toFixed(2),
      totalHtFrozen: totalHt.toFixed(2),
      tvaAmountFrozen: totalVat.toFixed(2),
      vatRateFrozen: vatRate.toFixed(2),
      prevHash,
      rowHash,
      status: "مؤكد",
    })
    .returning({ id: invoices.id, refCode: invoices.refCode });
  const invoiceId = inserted[0].id;

  await tx
    .insert(invoiceLines)
    .values(lineFrozen.map((l) => ({ invoiceId, ...l })));

  return { id: invoiceId, refCode: inserted[0].refCode };
}
