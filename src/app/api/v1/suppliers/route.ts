import { NextResponse } from "next/server";
import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { createSupplier, listSuppliers } from "@/modules/suppliers/service";
import { CreateSupplierInput } from "@/modules/suppliers/dto";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["pm", "gm", "manager", "stock_keeper"]);
    const url = new URL(request.url);
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const offset = url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : undefined;
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    const result = await withRead(undefined, (db) =>
      listSuppliers(db, { limit, offset, includeInactive }),
    );
    return NextResponse.json({ suppliers: result.rows, total: result.total });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const body = await request.json().catch(() => null);
    const parsed = CreateSupplierInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const supplier = await withTxInRoute(undefined, (tx) =>
      createSupplier(tx, parsed.data, claims.username),
    );
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
