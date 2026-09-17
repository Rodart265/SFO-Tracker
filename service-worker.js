/* Bump this on every deploy. The fetch handler is cache-first, so an installed
   phone will keep serving the old index.html forever until the cache name
   changes and the activate handler clears the previous version. */
const CACHE_NAME = "sfo-field-tracker-v5";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const CACHEABLE_CROSS_ORIGIN = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableFont = CACHEABLE_CROSS_ORIGIN.includes(url.origin);
  if (!isSameOrigin && !isCacheableFont) return; // let Firebase/Auth/Firestore calls go straight to network

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => cached)
      );
    })
  );
});
