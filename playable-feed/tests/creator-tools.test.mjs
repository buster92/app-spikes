import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPublicationCandidate,
  getRuntimeCapabilities,
  simulateForAuthoring,
  structuredDiagnostic,
  validateForAuthoring,
} from "../src/sandbox/creator-tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function example(name = "space-dodge") {
  return JSON.parse(await readFile(resolve(root, `examples/${name}.game.json`), "utf8"));
}

test("creator capabilities expose bounded data-only runtime", () => {
  const capabilities = getRuntimeCapabilities();
  assert.equal(capabilities.runtime, "playloop-2d-v0");
  assert.equal(capabilities.schemaVersion, 1);
  assert.ok(capabilities.entityKinds.includes("sprite"));
  assert.ok(capabilities.events.includes("collision"));
  assert.ok(capabilities.actions.includes("spawn"));
  assert.equal(capabilities.sandbox.arbitraryCode, false);
  assert.equal(capabilities.sandbox.network, false);
  assert.equal(capabilities.assets.addressing, "sha256");
  assert.ok(capabilities.assets.maxTotalDecodedImageBytes > 0);
});

test("author validation returns transport guidance for valid creator game", async () => {
  const result = validateForAuthoring(await example());
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.transport.instantEligible, true);
  assert.ok(result.transport.feedDescriptorBytes < 512);
  assert.equal(result.transport.declaredAssetBytes, 6700);
});

test("author validation converts errors to stable structured diagnostics", async () => {
  const spec = await example();
  spec.entities.find((entity) => entity.id === "player").asset = "missing";
  const result = validateForAuthoring(spec);
  assert.equal(result.ok, false);
  const unknown = result.diagnostics.find((item) => item.code === "UNKNOWN_ASSET");
  assert.ok(unknown, result.diagnostics.map((item) => item.message).join("\n"));
  assert.ok(unknown.path?.includes("asset"));
  assert.equal(unknown.stage, "publication_policy");
});

test("diagnostic classifier identifies atlas frame budget errors", () => {
  const item = structuredDiagnostic("entities[0].sourceWidth: source rectangle exceeds asset dimensions", {
    stage: "publication_policy",
  });
  assert.equal(item.code, "ATLAS_FRAME_OUT_OF_BOUNDS");
  assert.equal(item.path, "entities[0].sourceWidth");
});

test("creator simulation uses trusted runtime review rather than executable model code", async () => {
  const result = simulateForAuthoring(await example("meteor-dodge"), {
    seeds: [3, 11],
    maxSimulatedMs: 2000,
  });
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.summary.seeds, 2);
  assert.equal(result.summary.crashes, 0);
  assert.equal(result.runs.length, 2);
});

test("publication candidate hashes a valid spec but never signs it client-side", async () => {
  const candidate = await buildPublicationCandidate(await example("tap-bloom"));
  assert.equal(candidate.ok, true, candidate.diagnostics.map((item) => item.message).join("\n"));
  assert.match(candidate.manifest.specRef, /^sha256:[0-9a-f]{64}$/);
  assert.equal(candidate.manifest.runtime, "playloop-2d-v0");
  assert.equal(Object.hasOwn(candidate.manifest, "signature"), false);
});
