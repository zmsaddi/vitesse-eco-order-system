// D-40: Argon2id primary + bcrypt 14 fallback.
// CNIL délibération 2022-100 + ANSSI 2023: bcrypt 12 rounds = faible. Argon2id = recommended minimum.

// OWASP parameters (2023): m=64MiB, t=3, p=4
const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

const BCRYPT_ROUNDS = 14;

let driver: "argon2" | "bcrypt" | null = null;

async function detectDriver(): Promise<"argon2" | "bcrypt"> {
  if (driver) return driver;
  try {
    await import("@node-rs/argon2");
    driver = "argon2";
  } catch {
    // Native binding unavailable on this host (rare — Vercel Hobby supports it).
    console.warn("[password] @node-rs/argon2 unavailable — falling back to bcryptjs (14 rounds)");
    driver = "bcrypt";
  }
  return driver;
}

/**
 * Hash plaintext password. Returns self-contained hash string (includes algorithm + params).
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("password.hash: plaintext too short (min 8 chars)");
  }
  const d = await detectDriver();
  if (d === "argon2") {
    const { hash } = await import("@node-rs/argon2");
    return hash(plain, ARGON2_OPTIONS);
  }
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Verify plaintext against stored hash. Detects algorithm from hash prefix.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!plain || !stored) return false;
  // Argon2 hashes start with "$argon2id$"
  if (stored.startsWith("$argon2")) {
    try {
      const { verify } = await import("@node-rs/argon2");
      return verify(stored, plain);
    } catch {
      return false;
    }
  }
  // bcrypt hashes start with "$2a$" / "$2b$" / "$2y$"
  if (/^\$2[aby]\$/.test(stored)) {
    const bcrypt = await import("bcryptjs");
    return bcrypt.compare(plain, stored);
  }
  // Unknown format — safe fail.
  return false;
}

/**
 * Check whether a stored hash needs re-hashing (upgrade path).
 * Returns true for bcrypt hashes when Argon2id is available.
 */
export async function needsRehash(stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith("$argon2")) return false;
  const d = await detectDriver();
  return d === "argon2"; // bcrypt + argon2 available → upgrade
}
