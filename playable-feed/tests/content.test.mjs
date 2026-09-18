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
  "playtest-round2.css",
  "round3.css",
  "bus-feedback.css",
  "ux-feedback.js",
  "CREATOR-NETWORK-HYPOTHESIS.md",
  "icons/playloop-icon.svg",
  "icons/playloop-192.png",
  "icons/playloop-512.png",
  "icons/apple-touch-icon.png",
  "manifest.webmanifest",
  "sw.js",
  "src/bootstrap.js",
  "src/app.js",
  "src/analytics.js",
  "src/experiments.js",
  "src/feed.js",
  "src/games.js",
  "src/extra-games-register.js",
  "src/playtest-tuning.js",
  "src/playtest-round2.js",
  "src/bus-jam-v2.js",
  "src/bus-jam-v3.js",
  "src/navigation-guard.js",
  "src/progression.js",
  "src/round3-ui.js",
];

test("all local assets needed by the shell exist", async () => {
  await Promise.all(expectedFiles.map((file) => access(resolve(root, file))));
});

test("index contains feed, result, records and round-three surfaces", async () => {
  const html = await readFile(resolve(root, "index.html"), "utf8");
  for (const id of [
    "appShell", "feedStage", "gameCard", "gameHost", "resultOverlay",
    "onboarding", "startButton", "statsSheet", "recordsBody", "recordToast", "exportButton",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  for (const asset of [
    "styles.css", "interaction-fixes.css", "expansion.css", "playtest-tuning.css",
    "playtest-round2.css", "round3.css", "bus-feedback.css", "src/bootstrap.js",
  ]) {
    assert.ok(html.includes(asset), `index should load ${asset}`);
  }
  assert.match(html, /16 mechanics/);
  assert.match(html, /liked games/);
});

test("manifest has standalone metadata and standard install icons", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.orientation, "portrait-primary");
  assert.ok(manifest.icons.some((icon) => icon.src === "./icons/playloop-192.png" && icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./icons/playloop-512.png" && icon.sizes === "512x512"));
});

test("service worker caches the current offline shell", async () => {
  const sw = await readFile(resolve(root, "sw.js"), "utf8");
  for (const asset of [
    "index.html", "round3.css", "bus-feedback.css", "src/bootstrap.js", "src/app.js", "src/analytics.js",
    "src/experiments.js",
    "src/playtest-round2.js", "src/bus-jam-v2.js", "src/bus-jam-v3.js", "src/navigation-guard.js",
    "src/progression.js", "src/round3-ui.js", "social.css", "src/social/app.js",
    "src/social/service.js", "src/social/playable-host.js", "examples/meteor-dodge.game.json",
    "manifest.webmanifest",
  ]) {
    assert.ok(sw.includes(asset), `service worker should cache ${asset}`);
  }
  assert.match(sw, /playloop-spike-v16/);
  assert.match(sw, /event\.request\.mode === "navigate"/);
  assert.match(sw, /caches\.match\("\.\/index\.html"\)/);
});

test("app logging covers behavioral outcomes and renderer failures", async () => {
  const app = await readFile(resolve(root, "src/app.js"), "utf8");
  const analytics = await readFile(resolve(root, "src/analytics.js"), "utf8");
  const source = `${app}\n${analytics}`;
  for (const eventName of [
    "game_impression", "game_first_interaction", "game_interaction", "game_complete", "game_fail",
    "game_skip", "game_retry", "game_reward_granted", "game_reward_suppressed", "game_mount_error",
    "game_empty_render", "feed_transition_error", "game_paused_background", "feed_swipe",
    "feed_advance", "feed_reach_milestone", "session_end",
  ]) {
    assert.ok(source.includes(eventName), `missing analytics event ${eventName}`);
  }
  assert.match(analytics, /syncFromStorage/);
  assert.match(analytics, /liked_games/);
});

test("expanded games register and tuning load before app startup", async () => {
  const bootstrap = await readFile(resolve(root, "src/bootstrap.js"), "utf8");
  for (const module of [
    "extra-games-register.js", "playtest-tuning.js", "playtest-round2.js", "bus-jam-v2.js",
    "bus-jam-v3.js", "navigation-guard.js", "app.js", "progression.js", "round3-ui.js",
  ]) {
    assert.ok(bootstrap.includes(module), `bootstrap should import ${module}`);
  }
  assert.ok(bootstrap.indexOf("bus-jam-v2.js") < bootstrap.indexOf("bus-jam-v3.js"));
  assert.ok(bootstrap.indexOf("bus-jam-v3.js") < bootstrap.indexOf("app.js"));
  assert.ok(bootstrap.indexOf("navigation-guard.js") < bootstrap.indexOf("app.js"));
  assert.ok(bootstrap.indexOf("round3-ui.js") > bootstrap.indexOf("progression.js"));
});

test("phone tuning slows snake, enables match swipes and caps memory load", async () => {
  const tuning = await readFile(resolve(root, "src/playtest-tuning.js"), "utf8");
  assert.match(tuning, /500, 465, 430, 395, 360/);
  assert.match(tuning, /readyMs: 900/);
  assert.match(tuning, /gameSwipeControl/);
  assert.match(tuning, /match_swipe/);
  assert.match(tuning, /targetLength = \[0, 3, 3, 4, 4, 5\]/);
});

test("round two adds timer, arithmetic, moving hold and bus telemetry", async () => {
  const source = await readFile(resolve(root, "src/playtest-round2.js"), "utf8");
  for (const eventName of ["tap_rush_timeout", "number_choice", "hold_lost", "bus_depart"]) {
    assert.ok(source.includes(eventName), `missing ${eventName}`);
  }
  assert.match(source, /visible timer/);
  assert.match(source, /Higher levels mix in \+ and −/);
});

test("round three uses directional bus escape and protects game-owned swipes", async () => {
  const bus = await readFile(resolve(root, "src/bus-jam-v2.js"), "utf8");
  const guard = await readFile(resolve(root, "src/navigation-guard.js"), "utf8");
  for (const token of ["pathIsClear", "isSolvable", "bus_blocked", "bus_exit", "bus_passenger_boarded", "bus_parking_overflow"]) {
    assert.ok(bus.includes(token), `directional bus should include ${token}`);
  }
  assert.match(bus, /Free buses in their arrow direction/);
  assert.match(guard, /data-game-swipe-control/);
  assert.match(guard, /ownedControl && gameIsActive/);
});

test("Bus Jam makes boarding causality visible before departure", async () => {
  const bus = await readFile(resolve(root, "src/bus-jam-v3.js"), "utf8");
  const css = await readFile(resolve(root, "bus-feedback.css"), "utf8");
  for (const token of ["bus_boarding_animation_start", "bus_parking_animation_start", "bus_passenger_boarded"]) {
    assert.ok(bus.includes(token), `boarding feedback should include ${token}`);
  }
  assert.match(bus, /passenger →/);
  assert.match(css, /busPassengerBoard/);
  assert.match(css, /is-boarding-bus/);
  assert.match(css, /is-serving/);
});

test("round three exposes likes and visible reinforcement", async () => {
  const ui = await readFile(resolve(root, "src/round3-ui.js"), "utf8");
  const css = await readFile(resolve(root, "round3.css"), "utf8");
  for (const token of ["game_like_changed", "reward_feedback_shown", "difficulty_changed", "personal_record_broken", "streak_milestone"]) {
    assert.ok(ui.includes(token), `round3 UI should handle ${token}`);
  }
  assert.match(css, /\.reward-burst/);
  assert.match(css, /\.like-button/);
  assert.match(css, /\.bus-escape-bus/);
});

test("local progression persists records", async () => {
  const progression = await readFile(resolve(root, "src/progression.js"), "utf8");
  for (const field of ["bestXp", "bestStreak", "bestDifficulty", "longestRun"]) {
    assert.ok(progression.includes(field), `missing record field ${field}`);
  }
  assert.match(progression, /personal_record_broken/);
  assert.match(progression, /playloop\.records\.v1/);
});

test("a completed feed variant can grant progression only once", async () => {
  const app = await readFile(resolve(root, "src/app.js"), "utf8");
  assert.match(app, /rewardedVariantIds: new Set\(\)/);
  assert.match(app, /state\.rewardedVariantIds\.has\(game\.variantId\)/);
  assert.match(app, /game_reward_suppressed/);
  assert.match(app, /variant_already_rewarded/);
  assert.match(app, /els\.resultScore\.textContent = "0 XP"/);
});


test("secondary event writers use the central analytics pipeline", async () => {
  const [round3, progression, html] = await Promise.all([
    readFile(resolve(root, "src/round3-ui.js"), "utf8"),
    readFile(resolve(root, "src/progression.js"), "utf8"),
    readFile(resolve(root, "index.html"), "utf8"),
  ]);

  assert.match(round3, /import \{ logProductEvent \} from "\.\/analytics\.js"/);
  assert.match(round3, /logProductEvent\(name/);
  assert.doesNotMatch(round3, /events\.push\(event\)/);

  assert.match(progression, /import \{ logProductEvent \} from "\.\/analytics\.js"/);
  assert.match(progression, /logProductEvent\("personal_record_broken"/);
  assert.doesNotMatch(progression, /events\.push\(\{/);

  assert.match(html, /globalThis\.__playloopAnalytics/);
  assert.match(html, /analytics\.log\(name/);
});
