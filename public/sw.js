/* Flowdeck service worker — offline shell + runtime caching.
 * Strategy:
 *  - navigation: network-first, offline fallback to cached shell
 *  - static assets (_next/static, icons): network-first (fresh when
 *    online, cache fallback when offline)
 *  - never caches non-GET or external origins
 */

const VERSION = "flowdeck-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(["/", OFFLINE_URL]).catch(() => {});
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* static assets: cache-first */
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons/") || url.pathname.endsWith(".svg")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(ASSET_CACHE);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  /* navigations: network-first with offline fallback */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          return res;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          const shell = await caches.match("/");
          return shell || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
  }
});
