import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runReplayV3, validateReplayTraceV3 } from "../src/sandbox/replay-v3.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function json(relative) {
  return JSON.parse(await readFile(resolve(root, relative), "utf8"));
}

test("v3 replay trace validates against the explicit grid runtime id", async () => {
  const spec = await json("examples/bus-escape-v3.game.json");
  const trace = await json("examples/replays/bus-escape-v3.replay.json");
  assert.deepEqual(validateReplayTraceV3(spec, trace), { ok: true, errors: [] });
});

test("grid occupancy + queues replay deterministically", async () => {
  const spec = await json("examples/bus-escape-v3.game.json");
  const trace = await json("examples/replays/bus-escape-v3.replay.json");
  const first = runReplayV3(spec, trace);
  const second = runReplayV3(spec, trace);

  assert.deepEqual(first, second);
  assert.equal(first.runtime, "playloop-2d-v3");
  assert.equal(first.final.status, "complete");
  assert.equal(first.final.result.score, 2000);
  assert.deepEqual(first.final.collections.passengers, []);
  assert.deepEqual(first.final.collections.parking, []);
  assert.equal(first.final.variables.escaped, 4);
  assert.equal(first.final.entities.some((entity) => entity.tags?.includes("bus")), false);
});

test("older runtime ids cannot silently execute v3 grid traces", async () => {
  const spec = await json("examples/bus-escape-v3.game.json");
  const trace = await json("examples/replays/bus-escape-v3.replay.json");
  const wrong = { ...trace, runtime: "playloop-2d-v2" };
  const result = validateReplayTraceV3(spec, wrong);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("playloop-2d-v3")));
});
