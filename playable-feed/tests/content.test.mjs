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
  "ux-feedback.css",
  "expansion.css",
  "playtest-tuning.css",
  "ux-feedback.js",
  "icons/playloop-icon.svg",
  "icons/playloop-192.png",
  "icons/playloop-512.png",
  "icons/apple-touch-icon.png",
  "manifest.webmanifest",
  "sw.js",
  "src/bootstrap.js",
  "src/app.js",
  "src/analytics.js",
  "src/feed.js",
  "src/games.js",
  "src/extra-games-register.js",
  "src/playtest-tuning.js",
  "src/progression.js",
];

test("all local assets needed by the shell exist", async () => {
  await Promise.all(expectedFiles.map((file) => access(resolve(root, file))));
});

test("index contains the core feed, result, onboarding, records and analytics surfaces", async () => {
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
    "recordsBody",
    "recordToast",
    "exportButton",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /styles\.css/);
  assert.match(html, /interaction-fixes\.css/);
  assert.match(html, /expansion\.css/);
  assert.match(html, /playtest-tuning\.css/);
  assert.match(html, /icons\/playloop-icon\.svg/);
  assert.match(html, /icons\/apple-touch-icon\.png/);
  assert.match(html, /src\/bootstrap\.js/);
  assert.match(html, /15 mechanics/);
});

test("manifest has standalone metadata and standard install icons", async () => {
  const raw = await readFile(resolve(root, "manifest.webmanifest"), "utf8");
  const manifest = JSON.parse(raw);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.orientation, "portrait-primary");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some((icon) => icon.src === "./icons/playloop-192.png" && icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./icons/playloop-512.png" && icon.sizes === "512x512"));
});

test("service worker caches the expanded offline shell", async () => {
  const sw = await readFile(resolve(root, "sw.js"), "utf8");
  for (const asset of [
    "index.html",
    "styles.css",
    "interaction-fixes.css",
    "expansion.css",
    "playtest-tuning.css",
    "icons/playloop-icon.svg",
    "icons/playloop-192.png",
    "icons/playloop-512.png",
    "icons/apple-touch-icon.png",
    "src/bootstrap.js",
    "src/app.js",
    "src/games.js",
    "src/extra-games-register.js",
    "src/playtest-tuning.js",
    "src/progression.js",
    "manifest.webmanifest",
  ]) {
    assert.ok(sw.includes(asset), `service worker should cache ${asset}`);
  }
});

test("app logging covers behavioral outcomes and renderer failures", async () => {
  const app = await readFile(resolve(root, "src/app.js"), "utf8");
  const analytics = await readFile(resolve(root, "src/analytics.js"), "utf8");
  const html = await readFile(resolve(root, "index.html"), "utf8");
  const source = `${app}\n${analytics}\n${html}`;
  for (const eventName of [
    "game_impression",
    "game_first_interaction",
    "game_interaction",
    "game_complete",
    "game_fail",
    "game_skip",
    "game_retry",
    "game_mount_error",
    "game_empty_render",
    "feed_transition_error",
    "client_error",
    "client_unhandled_rejection",
    "game_paused_background",
    "game_resumed_after_background",
    "feed_swipe",
    "feed_advance",
    "feed_reach_milestone",
    "session_end",
  ]) {
    assert.ok(source.includes(eventName), `missing analytics event ${eventName}`);
  }
  assert.match(analytics, /syncFromStorage/);
});

test("expanded games register before phone tuning and app startup", async () => {
  const bootstrap = await readFile(resolve(root, "src/bootstrap.js"), "utf8");
  const extras = await readFile(resolve(root, "src/extra-games-register.js"), "utf8");
  assert.ok(bootstrap.indexOf("extra-games-register.js") < bootstrap.indexOf("playtest-tuning.js"));
  assert.ok(bootstrap.indexOf("playtest-tuning.js") < bootstrap.indexOf("app.js"));
  for (const gameId of ["dodge-stream", "jump-rush", "micro-snake", "micro-match"]) {
    assert.ok(extras.includes(`id: "${gameId}"`), `missing ${gameId}`);
  }
  assert.match(extras, /finish\("complete"/);
  assert.match(extras, /finish\("fail"/);
  for (const interaction of ["hazard_dodged", "target_hit", "snake_eat", "match_clear"]) {
    assert.ok(extras.includes(interaction), `missing ${interaction} interaction logging`);
  }
});

test("phone tuning slows snake, enables match swipes and caps memory load", async () => {
  const tuning = await readFile(resolve(root, "src/playtest-tuning.js"), "utf8");
  assert.match(tuning, /500, 465, 430, 395, 360/);
  assert.match(tuning, /readyMs: 900/);
  assert.match(tuning, /match_swipe/);
  assert.match(tuning, /is-clearing/);
  assert.match(tuning, /targetLength = \[0, 3, 3, 4, 4, 5\]/);
  assert.match(tuning, /finish\("complete"/);
  assert.match(tuning, /finish\("fail"/);
});

test("local progression persists records and logs record milestones", async () => {
  const progression = await readFile(resolve(root, "src/progression.js"), "utf8");
  for (const field of ["bestXp", "bestStreak", "bestDifficulty", "longestRun"]) {
    assert.ok(progression.includes(field), `missing record field ${field}`);
  }
  assert.match(progression, /personal_record_broken/);
  assert.match(progression, /playloop\.records\.v1/);
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
