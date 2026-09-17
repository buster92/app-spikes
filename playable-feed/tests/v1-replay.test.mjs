import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runReplayV1, validateReplayTraceV1 } from "../src/sandbox/replay-v1.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function json(relative) {
  return JSON.parse(await readFile(resolve(root, relative), "utf8"));
}

test("v1 replay trace validates against the v1 runtime id", async () => {
  for (const [specFile, traceFile] of [
    ["examples/pocket-shooter-v1.game.json", "examples/replays/pocket-shooter-v1-2s.replay.json"],
    ["examples/garden-catch-v1.game.json", "examples/replays/garden-catch-v1-3s.replay.json"],
  ]) {
    const spec = await json(specFile);
    const trace = await json(traceFile);
    assert.deepEqual(validateReplayTraceV1(spec, trace), { ok: true, errors: [] });
  }
});

test("v1 entity reads and local state replay deterministically", async () => {
  const spec = await json("examples/pocket-shooter-v1.game.json");
  const trace = await json("examples/replays/pocket-shooter-v1-2s.replay.json");
  const first = runReplayV1(spec, trace);
  const second = runReplayV1(spec, trace);

  assert.deepEqual(first, second);
  assert.equal(first.runtime, "playloop-2d-v1");
  assert.equal(first.captures.length, 4);
  assert.equal(first.final.elapsedMs, 2000);

  const player = first.final.entities.find((entity) => entity.id === "player");
  assert.ok(player);
  assert.equal(typeof player.state.health, "number");
  assert.ok(player.state.health >= 0 && player.state.health <= 3);
});

test("garden v1 replay is deterministic despite random spawns and movement", async () => {
  const spec = await json("examples/garden-catch-v1.game.json");
  const trace = await json("examples/replays/garden-catch-v1-3s.replay.json");
  const first = runReplayV1(spec, trace);
  const second = runReplayV1(spec, trace);

  assert.deepEqual(first, second);
  assert.equal(first.runtime, "playloop-2d-v1");
  assert.equal(first.captures.length, 4);
  assert.equal(first.final.elapsedMs, 3000);

  const player = first.final.entities.find((entity) => entity.id === "player");
  assert.ok(player);
  assert.equal(typeof player.state.health, "number");
  assert.equal(typeof player.state.berries, "number");
  assert.ok(first.final.entities.some((entity) => entity.tags.includes("berry") || entity.tags.includes("bee")));
});

test("v0 replay traces cannot be silently executed as v1", async () => {
  const spec = await json("examples/pocket-shooter-v1.game.json");
  const trace = await json("examples/replays/pocket-shooter-v1-2s.replay.json");
  const wrong = { ...trace, runtime: "playloop-2d-v0" };
  const result = validateReplayTraceV1(spec, wrong);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("playloop-2d-v1")));
});
