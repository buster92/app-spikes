const CACHE = "playloop-spike-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./interaction-fixes.css",
  "./icons/playloop-icon.svg",
  "./icons/playloop-192.png",
  "./icons/playloop-512.png",
  "./icons/apple-touch-icon.png",
  "./src/app.js",
  "./src/analytics.js",
  "./src/feed.js",
  "./src/games.js",
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
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
