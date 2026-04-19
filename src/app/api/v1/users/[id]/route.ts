import { NextResponse } from "next/server";
import { z } from "zod";
import { withRead, withTxInRoute } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { getUserById, updateUser } from "@/modules/users/service";
import { RoleDto } from "@/modules/users/dto";

// Dynamic route PUT /api/v1/users/[id] — PM/GM only, edit user.
// Soft-disable: pass { active: false } to deactivate (D-76 — no DELETE endpoint per D-04).
// All fields optional; any subset can be updated.

export const runtime = "nodejs";

const UpdatePatch = z
  .object({
    name: z.string().min(1).max(256).optional(),
    role: RoleDto.optional(),
    active: z.boolean().optional(),
    profitSharePct: z.number().min(0).max(100).optional(),
    profitShareStart: z.string().nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "يجب تمرير حقل واحد على الأقل للتعديل",
  });

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    await requireRole(request, ["pm", "gm"]);
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId < 1) {
      throw new ValidationError("معرِّف المستخدم غير صحيح");
    }

    const user = await withRead(undefined, (db) => getUserById(db, userId));
    return NextResponse.json({ user });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId < 1) {
      throw new ValidationError("معرِّف المستخدم غير صحيح");
    }

    const body = await request.json().catch(() => null);
    const parsed = UpdatePatch.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const user = await withTxInRoute(undefined, (tx) =>
      updateUser(tx, userId, parsed.data, claims.username),
    );
    return NextResponse.json({ user });
  } catch (err) {
    return apiError(err);
  }
}
