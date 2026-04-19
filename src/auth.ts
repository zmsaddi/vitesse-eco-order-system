import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withRead, withTxInRoute } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword, hashPassword, needsRehash } from "@/lib/password";
import type { Role } from "@/lib/session-claims";
import { authConfig as edgeAuthConfig } from "./auth.config";

// D-40 (Argon2id) + D-45 (8h absolute + 30m idle) + D-67 (SessionClaims abstraction)
// + D-59 (JWT carries role; middleware never hits DB).
//
// This file is Node-only (imports @node-rs/argon2 + DB client).
// Middleware imports auth.config.ts instead (edge-safe).

const LoginInput = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8),
});

const fullConfig = {
  ...edgeAuthConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { type: "text" },
        password: { type: "password" },
      },
      async authorize(rawCreds) {
        const parsed = LoginInput.safeParse(rawCreds);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;

        const rows = await withRead(undefined, async (db) =>
          db.select().from(users).where(eq(users.username, username)).limit(1),
        );
        const user = rows[0];
        if (!user || !user.active) return null;

        const ok = await verifyPassword(password, user.password);
        if (!ok) return null;

        // Opportunistic upgrade to Argon2id if stored hash is bcrypt (D-40)
        if (await needsRehash(user.password)) {
          const rehashed = await hashPassword(password);
          await withTxInRoute(undefined, async (tx) =>
            tx.update(users).set({ password: rehashed }).where(eq(users.id, user.id)),
          );
        }

        return {
          id: String(user.id),
          name: user.name,
          username: user.username,
          role: user.role as Role,
        };
      },
    }),
  ],
} satisfies NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(fullConfig);
