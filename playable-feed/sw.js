const CACHE = "playloop-spike-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./interaction-fixes.css",
  "./ux-feedback.css",
  "./expansion.css",
  "./ux-feedback.js",
  "./icons/playloop-icon.svg",
  "./icons/playloop-192.png",
  "./icons/playloop-512.png",
  "./icons/apple-touch-icon.png",
  "./src/bootstrap.js",
  "./src/app.js",
  "./src/analytics.js",
  "./src/feed.js",
  "./src/games.js",
  "./src/extra-games-register.js",
  "./src/progression.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // This spike changes frequently during phone playtests. Prefer the latest
  // GitHub Pages response and keep the cache only as an offline fallback so an
  // older service-worker snapshot cannot keep serving a fixed-but-stale bug.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
