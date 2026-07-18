/*
 * LexiGlass service worker — deliberately small and conservative.
 *
 * What it does:
 *   - precaches the /offline page (plus the assets its HTML references) and
 *     the app icons/manifest;
 *   - serves immutable build assets (/_next/static, /icons) cache-first;
 *   - serves page navigations network-first, falling back to /offline when
 *     the network is unreachable.
 *
 * What it deliberately does NOT do:
 *   - it never caches /api/* responses (they are per-user, authenticated);
 *   - it never caches authenticated page HTML — only the public /offline
 *     shell is stored, so no user data lives in the Cache Storage.
 *
 * Bump VERSION when shipping SW changes so old caches are dropped.
 */
const VERSION = "v2";
const STATIC_CACHE = "lexiglass-static-" + VERSION;
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

/**
 * Precache the offline page together with the /_next assets its HTML points
 * at (scripts, styles, fonts) so it stays interactive with no network —
 * the offline review UI needs its JS to read IndexedDB.
 */
async function precacheOfflinePage(cache) {
  const response = await fetch("/offline", { credentials: "same-origin" });
  if (!response.ok) throw new Error("Could not fetch /offline for precache");
  const html = await response.text();
  await cache.put("/offline", new Response(html, { headers: response.headers }));
  const assets = new Set();
  const re = /(?:src|href)="(\/_next\/[^"]+)"/g;
  let match;
  while ((match = re.exec(html)) !== null) assets.add(match[1]);
  await Promise.all(
    [...assets].map((url) =>
      cache.add(url).catch(() => {
        /* a missing asset must not fail the whole install */
      })
    )
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.all([cache.addAll(PRECACHE_URLS), precacheOfflinePage(cache)]))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API calls: responses are authenticated and per-user.
  if (url.pathname.startsWith("/api/")) return;

  // Immutable build assets and icons: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Page navigations: always try the network (fresh, authenticated HTML);
  // fall back to the cached public /offline shell when unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((hit) => hit || Response.error())
      )
    );
  }
});
