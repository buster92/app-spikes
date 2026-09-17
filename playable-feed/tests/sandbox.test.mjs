import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HARD_LIMITS, packageProfile, validateGameSpec } from "../src/sandbox/game-spec.js";
import { SandboxRuntime } from "../src/sandbox/runtime-core.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function example() {
  return JSON.parse(await readFile(resolve(root, "examples/meteor-dodge.game.json"), "utf8"));
}

test("example GameSpec validates and stays in instant tier", async () => {
  const spec = await example();
  const profile = packageProfile(spec);
  assert.equal(profile.ok, true, profile.errors.join("\n"));
  assert.equal(profile.instantEligible, true);
  assert.equal(profile.zeroAsset, true);
  assert.ok(profile.metrics.specBytes < HARD_LIMITS.maxSpecBytes);
});

test("sandbox rejects executable/network-shaped content", async () => {
  const spec = await example();
  spec.rules.push({ on: "start", actions: [{ eval: { code: "fetch('https://example.com')" } }] });
  const validation = validateGameSpec(spec);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("allowed action")));
});

test("runtime is deterministic for the same seed", async () => {
  const spec = await example();
  const run = (seed) => {
    const runtime = new SandboxRuntime(spec, { seed });
    runtime.start();
    for (let i = 0; i < 10; i += 1) runtime.step(100);
    return runtime.snapshot().entities.filter((entity) => entity.tags.includes("hazard"));
  };
  assert.deepEqual(run(123), run(123));
  assert.notDeepEqual(run(123), run(456));
});

test("runtime can complete the example without game-specific JavaScript", async () => {
  const spec = await example();
  const runtime = new SandboxRuntime(spec, { seed: 7 });
  runtime.start();
  for (let i = 0; i < 260 && runtime.status === "running"; i += 1) {
    runtime.pointer("pointerMove", 8, 540);
    runtime.step(50);
  }
  assert.equal(runtime.status, "complete");
  assert.ok(runtime.result.score >= 500);
  assert.equal(runtime.result.detail, "Survived 12 seconds");
});

test("collision rules can mutate state", async () => {
  const spec = await example();
  spec.entities.push({
    id: "forced-hazard",
    kind: "circle",
    tags: ["hazard"],
    x: 180,
    y: 490,
    radius: 15,
    color: "#f00"
  });
  const runtime = new SandboxRuntime(spec, { seed: 1 });
  runtime.start();
  runtime.step(16);
  assert.equal(runtime.variables.hits, 1);
});
