import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { withTxInRoute, type DbTx, type WithTxContext } from "@/db/client";
import { idempotencyKeys } from "@/db/schema";
import { BusinessRuleError, ConflictError, apiError } from "@/lib/api-errors";

// D-79: route-level Idempotency-Key wrapper.
// - PK lookup on (key, endpoint). `endpoint` is stored as full "METHOD /path/[param]/…".
// - `username` is validated AFTER lookup; mismatch → 409 IDEMPOTENCY_KEY_OWNER_MISMATCH.
// - Reservation pattern: advisory lock on hashtext(key|endpoint) → SELECT → if miss,
//   run handler to completion inside the same tx → INSERT the full row → COMMIT.
//   No nullable columns; no partial rows. Failed handler = rollback = fresh retry OK.
// - NO external side effects (HTTP, Blob, email, etc.) inside a protected handler.

const IDEMPOTENCY_TTL_HOURS = 24;

export type IdempotencyConfig = {
  /** Full "METHOD /api/v1/path/[id]/…" — method + path template (not request.url). */
  endpoint: string;
  /** Authenticated caller; compared against stored row.username on replay. */
  username: string;
  /** Parsed request body; hashed to detect "same key, different body" collisions. */
  body: unknown;
  /** Per D-16 contract: 'required' for cancel/collect/settlements/distributions, 'optional' elsewhere. */
  requireHeader: "required" | "optional";
};

export type IdempotencyHandlerResult = {
  status: number;
  body: unknown; // MUST be JSON-serializable — stored verbatim in idempotency_keys.response
};

/**
 * Run a mutation endpoint under the D-79 idempotency contract.
 * Returns a Response with the handler's (status, body), or a cached replay.
 */
export async function withIdempotencyRoute(
  request: Request,
  config: IdempotencyConfig,
  handler: (tx: DbTx) => Promise<IdempotencyHandlerResult>,
  ctx?: WithTxContext,
): Promise<Response> {
  try {
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? "";

    // Path 1 — no header.
    if (!idempotencyKey) {
      if (config.requireHeader === "required") {
        throw new BusinessRuleError(
          "هذه العملية تتطلب Idempotency-Key header.",
          "IDEMPOTENCY_KEY_REQUIRED",
          400,
          undefined,
          { endpoint: config.endpoint },
        );
      }
      // optional — run handler without idempotency guarantees.
      const result = await withTxInRoute(ctx, handler);
      return NextResponse.json(result.body, { status: result.status });
    }

    // Path 2 — header present.
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(config.body ?? null), "utf8")
      .digest("hex");

    return await withTxInRoute(ctx, async (tx) => {
      // Serialize concurrent calls to the same (key, endpoint).
      // hashtext() is Postgres-side — deterministic + no app-side bigint juggling.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey + "|" + config.endpoint}))`,
      );

      const existing = await tx
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, idempotencyKey),
            eq(idempotencyKeys.endpoint, config.endpoint),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const row = existing[0];
        if (row.username !== config.username) {
          throw new ConflictError(
            "خطأ فني — تواصل مع الدعم إن تكرر",
            "IDEMPOTENCY_KEY_OWNER_MISMATCH",
            { endpoint: config.endpoint },
          );
        }
        if (row.requestHash !== requestHash) {
          throw new ConflictError(
            "تم إرسال نفس الطلب مرتين. افتح الصفحة مجدداً وأعد المحاولة",
            "IDEMPOTENCY_KEY_MISMATCH",
            { endpoint: config.endpoint },
          );
        }
        // Cached replay — handler NOT executed.
        return NextResponse.json(row.response, { status: row.statusCode });
      }

      // First-time: execute handler fully, then INSERT the complete row.
      const result = await handler(tx);

      const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000);
      await tx.insert(idempotencyKeys).values({
        key: idempotencyKey,
        endpoint: config.endpoint,
        username: config.username,
        requestHash,
        response: (result.body ?? {}) as Record<string, unknown>,
        statusCode: result.status,
        expiresAt,
      });

      return NextResponse.json(result.body, { status: result.status });
    });
  } catch (err) {
    return apiError(err);
  }
}
