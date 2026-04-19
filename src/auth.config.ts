import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/session-claims";

// Edge-safe Auth.js config — imported by middleware.ts.
// Must NOT reference @node-rs/argon2, bcryptjs, or any DB driver (those are Node-only).
// The full config with Credentials provider + password verify lives in src/auth.ts.

export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,    // D-45 absolute 8h
    updateAge: 30 * 60,      // D-45 idle 30m
  },
  jwt: {
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [], // filled in src/auth.ts — middleware doesn't need providers to validate JWT

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; username?: string; role?: Role };
        token.id = u.id;
        if (u.username) token.username = u.username;
        if (u.role) token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { username?: string }).username = token.username as string | undefined;
        (session.user as { role?: Role }).role = token.role as Role | undefined;
      }
      return session;
    },
  },

  trustHost: true,
} satisfies NextAuthConfig;
