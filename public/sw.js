// Minimal service worker — exists primarily so the app is installable as a
// PWA (Chrome/Android and Safari both require a fetch handler + a manifest
// before offering "Add to Home Screen"). Deliberately network-first, not
// offline-first: this is a live recruiting dashboard backed by Supabase —
// silently serving stale candidate/application data would be actively
// harmful, so nothing here ever masks a network failure with cached data
// except the small static app-shell list below.

const SHELL_CACHE = "recruiting-os-shell-v1";
const APP_SHELL = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only ever serve from cache for the static shell assets themselves —
  // every other request (pages, API routes, data) always goes to the
  // network, cache-free.
  if (event.request.method !== "GET" || !APP_SHELL.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  );
});
