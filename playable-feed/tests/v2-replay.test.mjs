import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runReplayV2, validateReplayTraceV2 } from "../src/sandbox/replay-v2.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function json(relative) {
  return JSON.parse(await readFile(resolve(root, relative), "utf8"));
}

test("v2 replay trace validates against the v2 runtime id", async () => {
  const spec = await json("examples/pattern-echo-v2.game.json");
  const trace = await json("examples/replays/pattern-echo-v2.replay.json");
  assert.deepEqual(validateReplayTraceV2(spec, trace), { ok: true, errors: [] });
});

test("collection shuffle and indexed reads replay deterministically", async () => {
  const spec = await json("examples/pattern-echo-v2.game.json");
  const trace = await json("examples/replays/pattern-echo-v2.replay.json");
  const first = runReplayV2(spec, trace);
  const second = runReplayV2(spec, trace);

  assert.deepEqual(first, second);
  assert.equal(first.runtime, "playloop-2d-v2");
  assert.equal(first.captures.length, 3);
  assert.deepEqual(first.final.collections.pattern, [0, 3, 1, 2]);
  assert.equal(first.final.status, "complete");
  assert.equal(first.final.result.score, 1500);
});

test("v1 replay traces cannot be silently executed as v2", async () => {
  const spec = await json("examples/pattern-echo-v2.game.json");
  const trace = await json("examples/replays/pattern-echo-v2.replay.json");
  const wrong = { ...trace, runtime: "playloop-2d-v1" };
  const result = validateReplayTraceV2(spec, wrong);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("playloop-2d-v2")));
});
