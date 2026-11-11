/* Meteor Pilot offline support. Bump VERSION whenever you upload a new index.html so players get the update. */
const VERSION = "meteor-pilot-v35";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // the game page: try the network first so updates arrive, fall back to the cached copy offline.
  // Only a good response for the game page itself refreshes the cached game (never privacy.html, a 404 or a Wi-Fi login page).
  if (req.mode === "navigate") {
    const isGame = url.origin === location.origin && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"));
    e.respondWith(fetch(req).then(r => {
      if (isGame && r.ok && r.type === "basic") { const copy = r.clone(); e.waitUntil(caches.open(VERSION).then(c => c.put("index.html", copy))); }
      return r;
    }).catch(async () => (isGame ? null : await caches.match(req)) || caches.match("index.html")));
    return;
  }
  // fonts and our own files: cached copy first, refreshed in the background
  if (url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
