// Phase 5.5 — minimal service worker for Vitesse Eco PWA.
//
// Scope (narrow by design per D-84):
//   - Precaches a small app-shell: / , /offline, manifest, icons.
//   - Fetch strategy:
//     * Navigation requests → network-first; on failure, fall back to the
//       precached /offline page.
//     * Static same-origin GETs (/_next/static, /fonts, /icons) → stale-
//       while-revalidate for speed on slow networks.
//     * Everything else (API, auth) → bypass the worker entirely — never
//       caches authenticated data.
//
// No Workbox runtime (kept hand-rolled, ~80 LOC).

const CACHE_VERSION = "vitesse-v1";
const PRECACHE_URLS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isNavigation(request) {
  return request.mode === "navigate";
}

function isApiOrAuth(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (isApiOrAuth(url)) return; // never touch authenticated data

  if (isNavigation(request)) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((m) => m || Response.error()),
      ),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
