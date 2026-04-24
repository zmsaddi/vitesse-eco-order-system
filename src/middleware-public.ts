// Public middleware path rules extracted for unit testing.
// Installability assets must bypass auth or the login page can trigger redirect noise.

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/health",
  "/api/init",
] as const;

const PUBLIC_ASSET_PREFIXES = [
  "/icons/",
] as const;

const PUBLIC_ASSET_PATHS = [
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
] as const;

export const MIDDLEWARE_MATCHER =
  "/((?!_next/static|_next/image|favicon.ico|fonts/|icons/|manifest\\.webmanifest|sw\\.js|api/auth/).*)";

export function isPublicMiddlewarePath(path: string): boolean {
  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }

  if (PUBLIC_ASSET_PATHS.includes(path as (typeof PUBLIC_ASSET_PATHS)[number])) {
    return true;
  }

  return PUBLIC_ASSET_PREFIXES.some((p) => path.startsWith(p));
}
