const CACHE = "playloop-spike-v13";
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
  "./social.css",
  "./ux-feedback.js",
  "./icons/playloop-icon.svg",
  "./icons/playloop-192.png",
  "./icons/playloop-512.png",
  "./icons/apple-touch-icon.png",
  "./src/bootstrap.js",
  "./src/app.js",
  "./src/analytics.js",
  "./src/experiments.js",
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
  "./src/sandbox/asset-contract.js",
  "./src/sandbox/game-spec.js",
  "./src/sandbox/game-spec-v1.js",
  "./src/sandbox/game-spec-v2.js",
  "./src/sandbox/game-spec-v3.js",
  "./src/sandbox/publication-policy.js",
  "./src/sandbox/runtime-core.js",
  "./src/sandbox/safe-runtime.js",
  "./src/sandbox/runtime-v1.js",
  "./src/sandbox/runtime-v2.js",
  "./src/sandbox/runtime-v3.js",
  "./src/sandbox/transport.js",
  "./src/sandbox/web-canvas-host.js",
  "./src/social/app.js",
  "./src/social/catalog.js",
  "./src/social/domain.js",
  "./src/social/fixtures.js",
  "./src/social/playable-host.js",
  "./src/social/presentation.js",
  "./src/social/repository.js",
  "./src/social/service.js",
  "./examples/meteor-dodge.game.json",
  "./examples/tap-bloom.game.json",
  "./examples/pattern-echo-v2.game.json",
  "./examples/bus-escape-v3.game.json",
  "./examples/sokoban-push-v3.game.json",
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
