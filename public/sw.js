/* Minimal service worker: caches public static assets and an offline fallback.
   It never caches HTML for authenticated areas, API responses or anything with cookies/user data. */
const VERSION = "v1";
const STATIC = `lte-static-${VERSION}`;
const PRECACHE = ["/offline", "/icons/icon-192.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const PRIVATE = /^\/(dashboard|organizer|admin|api|auth|unsubscribe|newsletter|media)/;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || PRIVATE.test(url.pathname)) return;
  // Hashed build assets and icons: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // Page navigations: network only; show the offline page when the network is down.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline")));
  }
});
