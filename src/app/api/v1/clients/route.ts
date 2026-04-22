import { NextResponse } from "next/server";
import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { createClient, listActiveClients } from "@/modules/clients/service";
import { CreateClientInput } from "@/modules/clients/dto";

// GET + POST /api/v1/clients (pm/gm/manager/seller per permissions matrix — D-12).

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "seller"]);
    const url = new URL(request.url);
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const offset = url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : undefined;

    const result = await withRead(undefined, (db) => listActiveClients(db, { limit, offset }));
    return await jsonWithUnreadCount(
      { clients: result.rows, total: result.total },
      200,
      claims.userId,
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "seller"]);

    const body = await request.json().catch(() => null);
    const parsed = CreateClientInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة. راجع الحقول المميَّزة", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const client = await withTxInRoute(undefined, (tx) =>
      createClient(tx, parsed.data, claims.username),
    );
    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
