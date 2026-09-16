import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const expectedFiles = [
  "index.html",
  "styles.css",
  "interaction-fixes.css",
  "icons/playloop-icon.svg",
  "manifest.webmanifest",
  "sw.js",
  "src/app.js",
  "src/analytics.js",
  "src/feed.js",
  "src/games.js",
];

test("all local assets needed by the shell exist", async () => {
  await Promise.all(expectedFiles.map((file) => access(resolve(root, file))));
});

test("index contains the core feed, result, onboarding and analytics surfaces", async () => {
  const html = await readFile(resolve(root, "index.html"), "utf8");
  for (const id of [
    "appShell",
    "feedStage",
    "gameCard",
    "gameHost",
    "resultOverlay",
    "onboarding",
    "startButton",
    "statsSheet",
    "exportButton",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /styles\.css/);
  assert.match(html, /interaction-fixes\.css/);
  assert.match(html, /icons\/playloop-icon\.svg/);
  assert.match(html, /src\/app\.js/);
});

test("manifest has standalone metadata and an app icon", async () => {
  const raw = await readFile(resolve(root, "manifest.webmanifest"), "utf8");
  const manifest = JSON.parse(raw);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  assert.equal(manifest.icons[0].src, "./icons/playloop-icon.svg");
});

test("service worker pre-caches the critical offline assets", async () => {
  const sw = await readFile(resolve(root, "sw.js"), "utf8");
  for (const asset of [
    "index.html",
    "styles.css",
    "interaction-fixes.css",
    "icons/playloop-icon.svg",
    "src/app.js",
    "src/games.js",
    "manifest.webmanifest",
  ]) {
    assert.ok(sw.includes(asset), `service worker should cache ${asset}`);
  }
});

test("app logging covers the behavioral events needed for the spike", async () => {
  const app = await readFile(resolve(root, "src/app.js"), "utf8");
  const analytics = await readFile(resolve(root, "src/analytics.js"), "utf8");
  const source = `${app}\n${analytics}`;
  for (const eventName of [
    "game_impression",
    "game_first_interaction",
    "game_interaction",
    "game_complete",
    "game_fail",
    "game_skip",
    "game_retry",
    "game_paused_background",
    "game_resumed_after_background",
    "feed_swipe",
    "feed_advance",
    "feed_reach_milestone",
    "session_end",
  ]) {
    assert.ok(source.includes(eventName), `missing analytics event ${eventName}`);
  }
});

test("retry/resume attempts do not count as new feed impressions", async () => {
  const app = await readFile(resolve(root, "src/app.js"), "utf8");
  assert.match(app, /if \(!retry && !resumed\) \{/);
  assert.match(app, /mountCurrent\(\{ retry: true \}\)/);
  assert.match(app, /mountCurrent\(\{ resumed: true \}\)/);
});

test("upward feed gesture is handled in capture phase before game pointer-up", async () => {
  const app = await readFile(resolve(root, "src/app.js"), "utf8");
  assert.match(app, /pointerup[\s\S]*\{ capture: true \}/);
  assert.match(app, /event\.stopPropagation\(\)/);
});
