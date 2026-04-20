import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import {
  deliveries,
  invoiceLines,
  invoices,
  orders,
} from "@/db/schema";
import { NotFoundError } from "@/lib/api-errors";
import { invoiceRowToDto, invoiceLineRowToDto } from "./mappers";
import {
  enforceInvoiceVisibility,
  type InvoiceClaims,
} from "./permissions";
import type {
  InvoiceDetailDto,
  InvoiceDto,
  InvoiceLineDto,
  ListInvoicesQuery,
} from "./dto";

// Phase 4.1 — invoice read service.
//
// Writes happen inside confirm-delivery via ./issue.ts. This file is read-only:
//   - getInvoiceById(db, id, claims)         → header + lines (for UI + PDF)
//   - listInvoices(db, claims, filters)      → paginated list with role-filter
//   - getInvoiceForPdf(db, id, claims)       → same as getInvoiceById, kept as a
//                                               named alias so route files read
//                                               self-documenting.
//
// Role visibility — per enforceInvoiceVisibility:
//   pm/gm/manager : all
//   seller        : invoices whose parent order was created by the seller
//   driver        : invoices whose parent delivery was assigned to the driver
//   stock_keeper  : none (403)

export { enforceInvoiceVisibility } from "./permissions";
export type { InvoiceClaims } from "./permissions";

type VisibilityJoinRow = {
  orderCreatedBy: string;
  deliveryAssignedDriverId: number | null;
};

async function readVisibilityContext(
  db: DbHandle,
  orderId: number,
  deliveryId: number,
): Promise<VisibilityJoinRow> {
  const rows = await db
    .select({
      orderCreatedBy: orders.createdBy,
      deliveryAssignedDriverId: deliveries.assignedDriverId,
    })
    .from(orders)
    .innerJoin(deliveries, eq(deliveries.id, deliveryId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (rows.length === 0) {
    return { orderCreatedBy: "", deliveryAssignedDriverId: null };
  }
  return rows[0];
}

export async function getInvoiceById(
  db: DbHandle,
  id: number,
  claims: InvoiceClaims,
): Promise<InvoiceDetailDto> {
  const headerRows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)))
    .limit(1);
  if (headerRows.length === 0) throw new NotFoundError(`الفاتورة رقم ${id}`);
  const header = headerRows[0];

  const ctx = await readVisibilityContext(db, header.orderId, header.deliveryId);
  enforceInvoiceVisibility(ctx, claims);

  const lineRows = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, id))
    .orderBy(asc(invoiceLines.lineNumber));

  return {
    invoice: invoiceRowToDto(header),
    lines: lineRows.map(invoiceLineRowToDto),
  };
}

export const getInvoiceForPdf = getInvoiceById;

export async function listInvoices(
  db: DbHandle,
  claims: InvoiceClaims,
  q: ListInvoicesQuery,
): Promise<{ rows: InvoiceDto[]; total: number }> {
  const limit = Math.min(200, Math.max(1, q.limit));
  const offset = Math.max(0, q.offset);

  // Build filters:
  //   - soft-delete guard (always)
  //   - optional date range
  //   - optional status
  //   - role-scoped:
  //       seller → orders.createdBy = username (JOIN)
  //       driver → deliveries.assigned_driver_id = userId (JOIN)
  //       stock_keeper → always empty set (we short-circuit here)
  if (claims.role === "stock_keeper") {
    return { rows: [], total: 0 };
  }

  const conditions = [isNull(invoices.deletedAt)];
  if (q.dateFrom) conditions.push(gte(invoices.date, q.dateFrom));
  if (q.dateTo) conditions.push(lte(invoices.date, q.dateTo));
  if (q.status) conditions.push(eq(invoices.status, q.status));

  const base = db
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .innerJoin(deliveries, eq(deliveries.id, invoices.deliveryId));

  if (claims.role === "seller") {
    conditions.push(eq(orders.createdBy, claims.username));
  } else if (claims.role === "driver") {
    conditions.push(eq(deliveries.assignedDriverId, claims.userId));
  }

  const filtered = base
    .where(and(...conditions))
    .orderBy(desc(invoices.date), desc(invoices.id));

  const pageRows = await filtered.limit(limit).offset(offset);

  const countRes = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .innerJoin(deliveries, eq(deliveries.id, invoices.deliveryId))
    .where(and(...conditions));
  const total = countRes[0]?.c ?? 0;

  return {
    rows: pageRows.map((r) => invoiceRowToDto(r.invoice)),
    total,
  };
}

export type { InvoiceDetailDto, InvoiceDto, InvoiceLineDto };
