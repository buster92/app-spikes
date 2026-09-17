import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ASSET_POLICY, decodedImageBytes, validateNormalizedAssetMetadata } from "../src/sandbox/asset-contract.js";
import { DEMO_ASSET_CATALOG } from "../src/sandbox/demo-asset-catalog.js";
import { HARD_LIMITS, packageProfile, validateGameSpec } from "../src/sandbox/game-spec.js";
import { validatePublicationPolicy } from "../src/sandbox/publication-policy.js";
import { SandboxRuntime } from "../src/sandbox/runtime-core.js";
import { SafeSandboxRuntime } from "../src/sandbox/safe-runtime.js";
import { reviewGameSpec } from "../src/sandbox/review.js";
import { buildTransportPlan, canonicalJson } from "../src/sandbox/transport.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function example(name = "meteor-dodge") {
  return JSON.parse(await readFile(resolve(root, `examples/${name}.game.json`), "utf8"));
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("example GameSpecs validate and stay in instant tier", async () => {
  for (const name of ["meteor-dodge", "tap-bloom", "space-dodge"]) {
    const spec = await example(name);
    const profile = packageProfile(spec);
    const policy = validatePublicationPolicy(spec);
    assert.equal(profile.ok, true, `${name}: ${profile.errors.join("\n")}`);
    assert.equal(profile.instantEligible, true, `${name} should remain instant-tier`);
    assert.ok(profile.metrics.specBytes < HARD_LIMITS.maxSpecBytes);
    assert.equal(policy.ok, true, `${name}: ${policy.errors.join("\n")}`);
  }
});

test("primitive examples remain zero-asset while atlas example has a small bounded package", async () => {
  for (const name of ["meteor-dodge", "tap-bloom"]) {
    assert.equal(packageProfile(await example(name)).zeroAsset, true);
  }

  const spec = await example("space-dodge");
  const profile = packageProfile(spec);
  const policy = validatePublicationPolicy(spec);
  const plan = buildTransportPlan(spec);
  assert.equal(profile.zeroAsset, false);
  assert.equal(profile.metrics.declaredAssetBytes, 6700);
  assert.equal(spec.assets.length, 2);
  assert.ok(plan.firstPlayBytes < 32 * 1024, `first play is ${plan.firstPlayBytes} bytes`);
  assert.equal(policy.metrics.totalDecodedImageBytes, 839168);
  assert.ok(policy.metrics.totalDecodedImageBytes < ASSET_POLICY.maxTotalDecodedImageBytes);
});

test("demo asset catalog content hashes, bytes and raster dimensions are truthful", async () => {
  for (const [ref, metadata] of Object.entries(DEMO_ASSET_CATALOG)) {
    const relative = metadata.url.replace(/^\.\//, "");
    const bytes = await readFile(resolve(root, relative));
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    assert.equal(digest, ref, relative);
    assert.equal(bytes.byteLength, metadata.bytes, relative);
    if (metadata.kind === "image" && metadata.mime === "image/png") {
      assert.deepEqual(pngDimensions(bytes), { width: metadata.width, height: metadata.height }, relative);
    }
  }
});

test("normalized asset metadata rejects URLs, malformed hashes and excessive decoded rasters", () => {
  const valid = {
    id: "sprite",
    kind: "image",
    ref: `sha256:${"a".repeat(64)}`,
    bytes: 100,
    mime: "image/png",
    width: 64,
    height: 64,
  };
  assert.deepEqual(validateNormalizedAssetMetadata(valid), []);

  const malformed = { ...valid, ref: "https://example.com/asset.png" };
  assert.ok(validateNormalizedAssetMetadata(malformed).some((error) => error.includes("sha256")));

  const tooLargeDecoded = { ...valid, width: 1024, height: 1024, bytes: 100 };
  assert.equal(decodedImageBytes(tooLargeDecoded), 4 * 1024 * 1024);
  const overCompressedBudget = { ...valid, bytes: ASSET_POLICY.maxSingleImageBytes + 1 };
  assert.ok(validateNormalizedAssetMetadata(overCompressedBudget).some((error) => error.includes("per-image")));
});

test("machine-readable schema includes sprite, atlas and interaction safety fields", async () => {
  const schema = JSON.parse(await readFile(resolve(root, "sandbox/game-spec-v0.schema.json"), "utf8"));
  assert.equal(schema.$defs.entity.properties.collidable.type, "boolean");
  assert.equal(schema.$defs.entity.properties.interactive.type, "boolean");
  assert.equal(schema.$defs.entity.properties.sourceX.type, "integer");
  assert.equal(schema.$defs.entity.properties.sourceWidth.minimum, 1);
  assert.ok(schema.$defs.entity.dependentRequired.sourceX.includes("sourceHeight"));
  assert.ok(schema.$defs.entity.properties.kind.enum.includes("sprite"));
  assert.equal(schema.$defs.asset.properties.ref.pattern, "^sha256:[0-9a-f]{64}$");
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

test("publication policy rejects sprite refs and atlas frames outside trusted assets", async () => {
  const missing = await example("space-dodge");
  missing.entities.find((entity) => entity.id === "player").asset = "missing";
  const missingPolicy = validatePublicationPolicy(missing);
  assert.equal(missingPolicy.ok, false);
  assert.ok(missingPolicy.errors.some((error) => error.includes("unknown asset")));

  const outside = await example("space-dodge");
  const player = outside.entities.find((entity) => entity.id === "player");
  player.sourceX = 96;
  player.sourceWidth = 64;
  const outsidePolicy = validatePublicationPolicy(outside);
  assert.equal(outsidePolicy.ok, false);
  assert.ok(outsidePolicy.errors.some((error) => error.includes("source rectangle exceeds")));

  const incomplete = await example("space-dodge");
  const meteor = incomplete.templates.meteor;
  delete meteor.sourceHeight;
  const incompletePolicy = validatePublicationPolicy(incomplete);
  assert.equal(incompletePolicy.ok, false);
  assert.ok(incompletePolicy.errors.some((error) => error.includes("requires integer")));
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

test("safety runtime canonicalizes collision refs to aTag/bTag order", async () => {
  const spec = await example();
  const player = spec.entities.find((entity) => entity.id === "player");
  const hint = spec.entities.find((entity) => entity.id === "hint");
  const hazard = {
    id: "forced-hazard",
    kind: "circle",
    tags: ["hazard"],
    x: player.x,
    y: player.y,
    radius: 15,
    color: "#f00"
  };
  spec.entities = [hazard, player, hint];
  const runtime = new SafeSandboxRuntime(spec, { seed: 1 });
  runtime.start();
  runtime.step(0);
  assert.equal(runtime.entities.has("player"), true);
  assert.equal(runtime.entities.has("forced-hazard"), false);
  assert.equal(runtime.variables.hits, 1);
});

test("decorative sprites are ignored by physics/targeting and atlas frames survive normalization", async () => {
  const spec = await example("space-dodge");
  const player = spec.entities.find((entity) => entity.id === "player");
  spec.entities.push({
    id: "forced-meteor",
    kind: "sprite",
    asset: "space-atlas",
    sourceX: 64,
    sourceY: 0,
    sourceWidth: 64,
    sourceHeight: 64,
    tags: ["hazard"],
    x: player.x,
    y: player.y,
    width: 42,
    height: 42,
    interactive: false
  });
  const runtime = new SafeSandboxRuntime(spec, { seed: 1 });
  runtime.start();
  runtime.step(0);
  assert.equal(runtime.entities.has("background"), true);
  assert.equal(runtime.entities.get("background").collidable, false);
  assert.equal(runtime.entities.has("forced-meteor"), false);
  assert.equal(runtime.variables.hits, 1);
  assert.equal(runtime.entityAt(10, 10), null);
  const normalizedPlayer = runtime.entities.get("player");
  assert.equal(normalizedPlayer.asset, "space-atlas");
  assert.equal(normalizedPlayer.sourceX, 0);
  assert.equal(normalizedPlayer.sourceWidth, 64);
});

test("safety runtime terminates creator games at the global runtime ceiling", async () => {
  const spec = await example("tap-bloom");
  spec.timers = [];
  spec.rules = spec.rules.filter((rule) => rule.on !== "timer");
  const runtime = new SafeSandboxRuntime(spec, { seed: 1 });
  runtime.start();
  for (let i = 0; i < 1300 && runtime.status === "running"; i += 1) runtime.step(50);
  assert.equal(runtime.status, "fail");
  assert.equal(runtime.result.reason, "runtime_time_limit");
  assert.equal(runtime.result.elapsedMs, HARD_LIMITS.maxDurationMs);
});

test("transport plan keeps feed metadata tiny and content-addressed assets lazy", async () => {
  const zeroAsset = buildTransportPlan(await example("tap-bloom"));
  assert.ok(zeroAsset.feedDescriptorBytes < 512, `descriptor is ${zeroAsset.feedDescriptorBytes} bytes`);
  assert.ok(zeroAsset.firstPlayBytes < HARD_LIMITS.maxSpecBytes);
  assert.equal(zeroAsset.uncachedAssetBytes, 0);

  const spriteSpec = await example("space-dodge");
  const cold = buildTransportPlan(spriteSpec);
  const allCached = buildTransportPlan(spriteSpec, { cachedAssetRefs: spriteSpec.assets.map((asset) => asset.ref) });
  assert.ok(cold.feedDescriptorBytes < 512, `sprite descriptor is ${cold.feedDescriptorBytes} bytes`);
  assert.equal(cold.uncachedAssetBytes, 6700);
  assert.equal(allCached.uncachedAssetBytes, 0);
  assert.equal(allCached.firstPlayBytes, allCached.canonicalSpecBytes);
  assert.equal(cold.firstPlayBytes - allCached.firstPlayBytes, 6700);
  assert.equal(canonicalJson(spriteSpec), canonicalJson(JSON.parse(JSON.stringify(spriteSpec))));
});

test("automated review runs multiple deterministic safety probes without crashes", async () => {
  for (const name of ["meteor-dodge", "space-dodge"]) {
    const spec = await example(name);
    const report = reviewGameSpec(spec, { seeds: [3, 11, 29], maxSimulatedMs: 3000 });
    assert.equal(report.ok, true, `${name}: ${report.errors.join("\n")}`);
    assert.equal(report.summary.seeds, 3);
    assert.equal(report.summary.crashes, 0);
    assert.ok(report.summary.peakEntities <= HARD_LIMITS.maxEntities);
    assert.ok(report.summary.peakOps <= HARD_LIMITS.maxOpsPerStep);
    assert.ok(["pass", "pass_with_warnings"].includes(report.verdict));
  }
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
