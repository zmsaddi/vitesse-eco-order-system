import { NextResponse } from "next/server";
import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { createProduct, listProducts } from "@/modules/products/service";
import { CreateProductInput } from "@/modules/products/dto";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    // All authenticated roles can view products (sellers see them too — for order form).
    await requireRole(request, ["pm", "gm", "manager", "seller", "driver", "stock_keeper"]);
    const url = new URL(request.url);
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const offset = url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : undefined;
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const result = await withRead(undefined, (db) =>
      listProducts(db, { limit, offset, includeInactive }),
    );
    return NextResponse.json({ products: result.rows, total: result.total });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "stock_keeper"]);
    const body = await request.json().catch(() => null);
    const parsed = CreateProductInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const product = await withTxInRoute(undefined, (tx) =>
      createProduct(tx, parsed.data, claims.username),
    );
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
