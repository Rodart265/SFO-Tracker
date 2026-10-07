/* Bump CACHE_NAME on every deploy. It is what tells an installed phone that there is
   a new version: the activate handler deletes every cache with a different name, and
   the page shows "A new version is ready" when the new worker takes over. */
const CACHE_NAME = "sfo-field-tracker-v12";

/* Must all download, or the worker doesn't install (the old version keeps running). */
const APP_SHELL = [
  "./", "./index.html", "./manifest.json",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-192.png", "./icon-maskable-512.png",
];
/* The pinned Firebase SDK files the page imports at start-up. The page can't run
   without them, so they are fetched at install too; if one fails here it is still
   cached the first time the page loads it. Keep the version in step with index.html. */
const FIREBASE = "https://www.gstatic.com/firebasejs/10.12.2/";
const SDK_FILES = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map((f) => FIREBASE + f);
const CACHEABLE_CROSS_ORIGIN = ["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://www.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await Promise.allSettled(SDK_FILES.map((u) => cache.add(u)));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Only keep good answers. Opaque responses (cross-origin fonts requested without
   CORS) can't be inspected, so they are kept for the font hosts only. */
function worthCaching(response, isCrossOrigin) {
  return response && (response.ok || (isCrossOrigin && response.type === "opaque"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_CROSS_ORIGIN.includes(url.origin)) return; // Firebase Auth / Firestore and Cloudinary photo calls go straight to the network
  if (sameOrigin && url.pathname.endsWith("/admin.html")) return;           // the admin page needs a live connection anyway; never serve it stale

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    const fromNetwork = () => fetch(req).then((response) => {
      if (worthCaching(response, !sameOrigin)) cache.put(req, response.clone());
      return response;
    });
    /* Cached copy wins, so the app opens instantly even with no signal. Our own files
       are refreshed in the background for next time; the pinned SDK files and fonts
       never change, so they are not re-downloaded (that would cost mobile data). */
    if (cached) { if (sameOrigin) fromNetwork().catch(() => {}); return cached; }
    try { return await fromNetwork(); }
    catch (err) {
      /* Offline, nothing cached for this URL: a page navigation falls back to the
         app itself rather than the browser's dinosaur. */
      if (req.mode === "navigate") { const shell = await cache.match("./index.html"); if (shell) return shell; }
      throw err;
    }
  })());
});
