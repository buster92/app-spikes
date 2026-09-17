const CACHE = "playloop-spike-v12";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./interaction-fixes.css",
  "./ux-feedback.css",
  "./expansion.css",
  "./playtest-tuning.css",
  "./playtest-round2.css",
  "./round3.css",
  "./bus-feedback.css",
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
  "./src/playtest-tuning.js",
  "./src/playtest-round2.js",
  "./src/bus-jam-v2.js",
  "./src/bus-jam-v3.js",
  "./src/navigation-guard.js",
  "./src/progression.js",
  "./src/round3-ui.js",
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
