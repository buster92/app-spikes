import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  packageProfileV2,
  validateGameSpecV2,
  validatePublicationPolicyV2,
} from "../src/sandbox/game-spec-v2.js";
import { reviewGameSpecV2 } from "../src/sandbox/review-v2.js";
import { SafeSandboxRuntimeV2 } from "../src/sandbox/runtime-v2.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function patternEcho() {
  return JSON.parse(await readFile(resolve(root, "examples/pattern-echo-v2.game.json"), "utf8"));
}

function advance(runtime, targetMs) {
  while (runtime.status === "running" && runtime.elapsedMs < targetMs) {
    runtime.step(Math.min(50, targetMs - runtime.elapsedMs));
  }
}

test("v2 Pattern Echo validates and keeps collections tightly bounded", async () => {
  const spec = await patternEcho();
  const validation = validateGameSpecV2(spec);
  const publication = validatePublicationPolicyV2(spec);
  const profile = packageProfileV2(spec);

  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(publication.ok, true, publication.errors.join("\n"));
  assert.equal(profile.ok, true, profile.errors.join("\n"));
  assert.equal(profile.instantEligible, true);
  assert.equal(profile.zeroAsset, true);
  assert.equal(profile.metrics.collections, 1);
  assert.equal(profile.metrics.collectionItems, 4);
  assert.ok(profile.metrics.specBytes < 16 * 1024);
});

test("collection shuffle is deterministic for the runtime seed", async () => {
  const first = new SafeSandboxRuntimeV2(await patternEcho(), { seed: 42 });
  const second = new SafeSandboxRuntimeV2(await patternEcho(), { seed: 42 });
  first.start();
  second.start();

  assert.deepEqual(first.collections.pattern, [0, 3, 1, 2]);
  assert.deepEqual(first.collections.pattern, second.collections.pattern);
});

test("collection indexing plus entity-local state can drive a memory game", async () => {
  const runtime = new SafeSandboxRuntimeV2(await patternEcho(), { seed: 42 });
  runtime.start();
  advance(runtime, 2800);
  assert.equal(runtime.variables.accepting, true);

  for (const slot of runtime.collections.pattern) {
    const entity = runtime.entities.get(`pad${slot}`);
    runtime.pointer("tap", entity.x, entity.y);
  }

  assert.equal(runtime.status, "complete");
  assert.equal(runtime.variables.input_index, 4);
  assert.equal(runtime.variables.score, 1000);
  assert.equal(runtime.result.score, 1500);
  assert.equal(runtime.result.detail, "Pattern repeated");
});

test("v2 rejects non-scalar collection items", async () => {
  const spec = await patternEcho();
  spec.collections.pattern[1] = { nested: true };
  const result = validateGameSpecV2(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("collection items must be scalar")));
});

test("v2 rejects references to undeclared collections", async () => {
  const spec = await patternEcho();
  const flash = spec.rules.find((rule) => rule.timerId === "flash");
  flash.condition.right.collection.name = "missing";
  const result = validateGameSpecV2(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("unknown collection 'missing'")));
});

test("runtime enforces the collection item ceiling even for valid dynamic actions", async () => {
  const spec = await patternEcho();
  const start = spec.rules.find((rule) => rule.on === "start");
  start.actions = Array.from({ length: 13 }, (_, index) => ({
    pushCollection: { name: "pattern", value: index },
  }));

  const validation = validateGameSpecV2(spec);
  assert.equal(validation.ok, true, validation.errors.join("\n"));

  const runtime = new SafeSandboxRuntimeV2(spec, { seed: 1 });
  assert.throws(() => runtime.start(), /exceeded 16 items/);
  assert.equal(runtime.status, "failed");
  assert.equal(runtime.result.reason, "collection_budget_exceeded");
  assert.equal(runtime.collections.pattern.length, 16);
});

test("v2 review runs inside the same bounded deterministic safety envelope", async () => {
  const report = reviewGameSpecV2(await patternEcho(), {
    seeds: [3, 11, 29],
    maxSimulatedMs: 4500,
  });
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.equal(report.runtime, "playloop-2d-v2");
  assert.equal(report.summary.seeds, 3);
  assert.equal(report.summary.crashes, 0);
  assert.ok(["pass", "pass_with_warnings"].includes(report.verdict));
});
