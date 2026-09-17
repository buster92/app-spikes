import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  packageProfileV3,
  validateGameSpecV3,
  validatePublicationPolicyV3,
} from "../src/sandbox/game-spec-v3.js";
import { runReplayV3, validateReplayTraceV3 } from "../src/sandbox/replay-v3.js";
import { SafeSandboxRuntimeV3 } from "../src/sandbox/runtime-v3.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function json(relative) {
  return JSON.parse(await readFile(resolve(root, relative), "utf8"));
}

async function sokoban() {
  return json("examples/sokoban-push-v3.game.json");
}

test("v3 Crate Push validates as a second zero-asset grid genre", async () => {
  const spec = await sokoban();
  const validation = validateGameSpecV3(spec);
  const publication = validatePublicationPolicyV3(spec);
  const profile = packageProfileV3(spec);

  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(publication.ok, true, publication.errors.join("\n"));
  assert.equal(profile.ok, true, profile.errors.join("\n"));
  assert.equal(profile.instantEligible, true);
  assert.equal(profile.zeroAsset, true);
  assert.equal(profile.metrics.grids, 1);
  assert.equal(profile.metrics.gridCells, 25);
  assert.equal(profile.metrics.gridEntities, 5);
  assert.ok(profile.metrics.specBytes < 16 * 1024);
});

test("Sokoban-style pushing composes existing occupancy and movement primitives", async () => {
  const runtime = new SafeSandboxRuntimeV3(await sokoban(), { seed: 17 });
  runtime.start();

  runtime.pointer("tap", 240, 466); // push right
  runtime.pointer("tap", 240, 466); // push right
  runtime.pointer("tap", 180, 466); // move down
  runtime.pointer("tap", 240, 466); // move right
  runtime.pointer("tap", 180, 410); // push up
  runtime.pointer("tap", 180, 410); // push onto goal
  runtime.step(50);

  assert.equal(runtime.status, "complete");
  assert.deepEqual(runtime.entities.get("crate").grid, {
    grid: "board",
    column: 3,
    row: 1,
    columnSpan: 1,
    rowSpan: 1,
  });
  assert.deepEqual(runtime.entities.get("player").grid, {
    grid: "board",
    column: 3,
    row: 2,
    columnSpan: 1,
    rowSpan: 1,
  });
  assert.equal(runtime.variables.moves, 6);
  assert.equal(runtime.variables.pushes, 4);
  assert.equal(runtime.result.score, 940);
  assert.equal(runtime.result.detail, "Crate delivered");
});

test("blocked Sokoban movement remains a normal game outcome rather than a runtime failure", async () => {
  const runtime = new SafeSandboxRuntimeV3(await sokoban(), { seed: 17 });
  runtime.start();

  runtime.pointer("tap", 120, 466); // player is already against the left edge

  assert.equal(runtime.status, "running");
  assert.equal(runtime.variables.moves, 0);
  assert.deepEqual(runtime.entities.get("player").grid, {
    grid: "board",
    column: 0,
    row: 3,
    columnSpan: 1,
    rowSpan: 1,
  });
});

test("Sokoban replay is deterministic and reaches the same logical result", async () => {
  const spec = await sokoban();
  const trace = await json("examples/replays/sokoban-push-v3.replay.json");
  assert.deepEqual(validateReplayTraceV3(spec, trace), { ok: true, errors: [] });

  const first = runReplayV3(spec, trace);
  const second = runReplayV3(spec, trace);
  assert.deepEqual(first, second);
  assert.equal(first.final.status, "complete");
  assert.equal(first.final.variables.moves, 6);
  assert.equal(first.final.variables.pushes, 4);
  assert.equal(first.final.result.score, 940);
  assert.deepEqual(first.final.entities.find((entity) => entity.id === "crate")?.grid, {
    grid: "board",
    column: 3,
    row: 1,
    columnSpan: 1,
    rowSpan: 1,
  });
});
