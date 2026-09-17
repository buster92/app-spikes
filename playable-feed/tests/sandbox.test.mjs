import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HARD_LIMITS, packageProfile, validateGameSpec } from "../src/sandbox/game-spec.js";
import { validatePublicationPolicy } from "../src/sandbox/publication-policy.js";
import { SandboxRuntime } from "../src/sandbox/runtime-core.js";
import { reviewGameSpec } from "../src/sandbox/review.js";
import { buildTransportPlan, canonicalJson } from "../src/sandbox/transport.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function example(name = "meteor-dodge") {
  return JSON.parse(await readFile(resolve(root, `examples/${name}.game.json`), "utf8"));
}

test("example GameSpecs validate and stay in instant tier", async () => {
  for (const name of ["meteor-dodge", "tap-bloom"]) {
    const spec = await example(name);
    const profile = packageProfile(spec);
    assert.equal(profile.ok, true, `${name}: ${profile.errors.join("\n")}`);
    assert.equal(profile.instantEligible, true);
    assert.equal(profile.zeroAsset, true);
    assert.ok(profile.metrics.specBytes < HARD_LIMITS.maxSpecBytes);
    assert.equal(validatePublicationPolicy(spec).ok, true);
  }
});

test("sandbox rejects executable/network-shaped content", async () => {
  const spec = await example();
  spec.rules.push({ on: "start", actions: [{ eval: { code: "fetch('https://example.com')" } }] });
  const validation = validateGameSpec(spec);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("allowed action")));
});

test("publication policy rejects unknown hidden fields and bad semantic references", async () => {
  const spec = await example();
  spec.secretUrl = "https://example.com/hidden";
  spec.rules.push({
    on: "timer",
    timerId: "does-not-exist",
    actions: [{ spawn: { template: "missing-template" } }],
  });
  const policy = validatePublicationPolicy(spec);
  assert.equal(policy.ok, false);
  assert.ok(policy.errors.some((error) => error.includes("secretUrl")));
  assert.ok(policy.errors.some((error) => error.includes("unknown timer")));
  assert.ok(policy.errors.some((error) => error.includes("unknown template")));
});

test("publication policy keeps semantic emit payloads small and flat", async () => {
  const spec = await example();
  spec.rules.push({
    on: "start",
    actions: [{ emit: { name: "creator_event", data: { nested: { value: 1 } } } }],
  });
  const policy = validatePublicationPolicy(spec);
  assert.equal(policy.ok, false);
  assert.ok(policy.errors.some((error) => error.includes("emit.data")));
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

test("runtime can complete the dodge example without game-specific JavaScript", async () => {
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

test("the same runtime can execute a distinct tap mechanic from data", async () => {
  const spec = await example("tap-bloom");
  const runtime = new SandboxRuntime(spec, { seed: 21 });
  runtime.start();
  for (let i = 0; i < 10 && runtime.status === "running"; i += 1) {
    const target = runtime.entities.get("target");
    runtime.pointer("tap", target.x, target.y);
    if (runtime.status === "running") runtime.step(0);
  }
  assert.equal(runtime.status, "complete");
  assert.equal(runtime.variables.taps, 10);
  assert.equal(runtime.result.detail, "Ten blooms");
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

test("transport plan keeps the feed descriptor tiny and lazy-loads the game body", async () => {
  const spec = await example("tap-bloom");
  const plan = buildTransportPlan(spec);
  assert.ok(plan.feedDescriptorBytes < 512, `descriptor is ${plan.feedDescriptorBytes} bytes`);
  assert.ok(plan.firstPlayBytes < HARD_LIMITS.maxSpecBytes);
  assert.equal(plan.uncachedAssetBytes, 0);
  assert.equal(plan.profile.instantEligible, true);
  assert.equal(canonicalJson(spec), canonicalJson(JSON.parse(JSON.stringify(spec))));
});

test("automated review runs multiple deterministic safety probes without crashes", async () => {
  const spec = await example();
  const report = reviewGameSpec(spec, { seeds: [3, 11, 29], maxSimulatedMs: 3000 });
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.equal(report.summary.seeds, 3);
  assert.equal(report.summary.crashes, 0);
  assert.ok(report.summary.peakEntities <= HARD_LIMITS.maxEntities);
  assert.ok(report.summary.peakOps <= HARD_LIMITS.maxOpsPerStep);
  assert.ok(["pass", "pass_with_warnings"].includes(report.verdict));
});

test("automated review rejects a statically invalid creator game before simulation", async () => {
  const spec = await example();
  spec.rules.push({ on: "start", actions: [{ javascript: { source: "while(true){}" } }] });
  const report = reviewGameSpec(spec);
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.equal(report.stage, "static_validation");
  assert.equal(report.runs.length, 0);
});

test("automated review rejects GameSpecs that pass basic syntax but violate publication policy", async () => {
  const spec = await example();
  spec.unreviewedPayload = "hidden";
  const report = reviewGameSpec(spec);
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.equal(report.stage, "publication_policy");
  assert.equal(report.runs.length, 0);
});
