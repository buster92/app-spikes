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
import { reviewGameSpecV3 } from "../src/sandbox/review-v3.js";
import { SafeSandboxRuntimeV3 } from "../src/sandbox/runtime-v3.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function busEscape() {
  return JSON.parse(await readFile(resolve(root, "examples/bus-escape-v3.game.json"), "utf8"));
}

function advance(runtime, targetMs) {
  while (runtime.status === "running" && runtime.elapsedMs < targetMs) {
    runtime.step(Math.min(50, targetMs - runtime.elapsedMs));
  }
}

test("v3 Bus Escape validates, remains tiny and bounds its board", async () => {
  const spec = await busEscape();
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
  assert.equal(profile.metrics.gridEntities, 4);
  assert.ok(profile.metrics.specBytes < 16 * 1024);
});

test("grid-derived rendering positions match declared placement", async () => {
  const runtime = new SafeSandboxRuntimeV3(await busEscape(), { seed: 1 });
  const gold = runtime.entities.get("gold-bus");
  const green = runtime.entities.get("green-bus");
  const blue = runtime.entities.get("blue-bus");
  const red = runtime.entities.get("red-bus");

  assert.deepEqual([gold.x, gold.y], [234, 204]);
  assert.deepEqual([green.x, green.y], [99, 177]);
  assert.deepEqual([blue.x, blue.y], [72, 366]);
  assert.deepEqual([red.x, red.y], [207, 393]);
});

test("path-to-edge occupancy changes as blocking buses leave", async () => {
  const runtime = new SafeSandboxRuntimeV3(await busEscape(), { seed: 7 });
  runtime.start();

  const gold = runtime.entities.get("gold-bus");
  const green = runtime.entities.get("green-bus");
  const blue = runtime.entities.get("blue-bus");
  const red = runtime.entities.get("red-bus");

  assert.equal(runtime.pathClearToEdge(gold, "up"), true);
  assert.equal(runtime.pathClearToEdge(green, "right"), false);
  assert.equal(runtime.pathClearToEdge(blue, "up"), false);
  assert.equal(runtime.pathClearToEdge(red, "left"), false);

  runtime.pointer("tap", gold.x, gold.y);
  assert.equal(runtime.entities.has("gold-bus"), false);
  assert.deepEqual(runtime.collections.parking, ["gold"]);
  assert.equal(runtime.pathClearToEdge(green, "right"), true);

  runtime.pointer("tap", green.x, green.y);
  assert.equal(runtime.entities.has("green-bus"), false);
  assert.deepEqual(runtime.collections.passengers, ["gold", "red", "blue"]);
  assert.equal(runtime.pathClearToEdge(blue, "up"), true);
});

test("the intended bus sequence serves direct and parked passengers", async () => {
  const runtime = new SafeSandboxRuntimeV3(await busEscape(), { seed: 42 });
  runtime.start();

  advance(runtime, 500);
  runtime.pointer("tap", 234, 204);
  advance(runtime, 1000);
  runtime.pointer("tap", 99, 177);
  advance(runtime, 1250);
  assert.deepEqual(runtime.collections.passengers, ["red", "blue"]);
  assert.deepEqual(runtime.collections.parking, []);

  advance(runtime, 1500);
  runtime.pointer("tap", 72, 366);
  assert.deepEqual(runtime.collections.parking, ["blue"]);

  advance(runtime, 2000);
  runtime.pointer("tap", 207, 393);
  advance(runtime, 2250);

  assert.equal(runtime.status, "complete");
  assert.deepEqual(runtime.collections.passengers, []);
  assert.deepEqual(runtime.collections.parking, []);
  assert.equal(runtime.variables.escaped, 4);
  assert.equal(runtime.result.score, 2000);
  assert.equal(runtime.result.detail, "All passengers served");
});

test("v3 rejects overlapping initial grid placements", async () => {
  const spec = await busEscape();
  const red = spec.entities.find((entity) => entity.id === "red-bus");
  red.grid = { grid: "yard", column: 0, row: 0, columnSpan: 1, rowSpan: 1 };
  const result = validateGameSpecV3(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("overlaps")));
});

test("v3 rejects boards above the fixed cell budget", async () => {
  const spec = await busEscape();
  spec.grids.yard.columns = 9;
  spec.grids.yard.rows = 9;
  const result = validateGameSpecV3(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("max 64 cells")));
});

test("grid movement refuses collisions rather than silently overlapping", async () => {
  const runtime = new SafeSandboxRuntimeV3(await busEscape(), { seed: 1 });
  runtime.start();
  const green = runtime.entities.get("green-bus");
  assert.throws(() => runtime.moveGridEntity(green, 2, 0), /blocked or outside/);
  assert.equal(runtime.status, "failed");
  assert.equal(runtime.result.reason, "grid_move_blocked");
});

test("v3 review stays inside the same bounded safety envelope", async () => {
  const report = reviewGameSpecV3(await busEscape(), {
    seeds: [3, 11, 29],
    maxSimulatedMs: 5000,
  });
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.equal(report.runtime, "playloop-2d-v3");
  assert.equal(report.summary.seeds, 3);
  assert.equal(report.summary.crashes, 0);
  assert.ok(["pass", "pass_with_warnings"].includes(report.verdict));
});
