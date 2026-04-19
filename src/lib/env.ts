import { z } from "zod";

// Zod-validated environment variables (D-23 + D-15 + D-66 + D-67).
// يُستدعى مرة واحدة عند bootstrap ويُرمى exception إن أي قيمة مفقودة/خاطئة.

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database (D-05 + D-26)
  DATABASE_URL: z.string().url(),

  // Auth (D-40 + D-45 + D-67)
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url().optional(),

  // Voice (D-31 + D-73)
  GROQ_API_KEY: z.string().optional(),

  // Storage (D-43 + D-60)
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BACKUP_ENCRYPTION_KEY: z.string().min(32).optional(),

  // Cron (D-42 + D-43)
  CRON_SECRET: z.string().min(16).optional(),

  // Init bootstrap secret — required to call POST /api/init (Phase 1a hardening).
  // 16+ chars, random. If unset, /api/init refuses to run in non-development NODE_ENV.
  INIT_BOOTSTRAP_SECRET: z.string().min(16).optional(),

  // Dev-only destructive
  ALLOW_DB_RESET: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[env] Invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Environment validation failed — see errors above");
  }
  // Production safety: ALLOW_DB_RESET must NOT be true
  if (parsed.data.NODE_ENV === "production" && parsed.data.ALLOW_DB_RESET) {
    throw new Error("ALLOW_DB_RESET=true is forbidden in production");
  }
  cached = parsed.data;
  return cached;
}
