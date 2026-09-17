import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runReplay, stableRuntimeSnapshot, validateReplayTrace } from "../src/sandbox/replay.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function json(relative) {
  return JSON.parse(await readFile(resolve(root, relative), "utf8"));
}

test("replay trace is valid for its declared game/runtime", async () => {
  const spec = await json("examples/space-dodge.game.json");
  const trace = await json("examples/replays/space-dodge-3s.replay.json");
  assert.deepEqual(validateReplayTrace(spec, trace), { ok: true, errors: [] });
});

test("same GameSpec + seed + input trace produces stable replay output", async () => {
  const spec = await json("examples/space-dodge.game.json");
  const trace = await json("examples/replays/space-dodge-3s.replay.json");
  const first = runReplay(spec, trace);
  const second = runReplay(spec, trace);
  assert.deepEqual(first, second);
  assert.ok(first.captures.length >= 1);
  assert.ok(first.final.elapsedMs > 0 && first.final.elapsedMs <= trace.durationMs);
  assert.equal(first.gameId, "space-dodge");
});

test("changing only replay seed changes deterministic spawned state", async () => {
  const spec = await json("examples/space-dodge.game.json");
  const trace = await json("examples/replays/space-dodge-3s.replay.json");
  const first = runReplay(spec, trace);
  const second = runReplay(spec, { ...trace, seed: 99 });
  assert.notDeepEqual(first, second);
});

test("stableRuntimeSnapshot sorts entities and rounds floating state", () => {
  const snapshot = stableRuntimeSnapshot({
    status: "running",
    elapsedMs: 10,
    variables: { score: 1.0000000004 },
    entities: [
      { id: "z", x: 1.123456789 },
      { id: "a", x: 2.987654321 },
    ],
    result: null,
  });
  assert.deepEqual(snapshot.entities.map((entity) => entity.id), ["a", "z"]);
  assert.equal(snapshot.entities[0].x, 2.987654);
  assert.equal(snapshot.variables.score, 1);
});
