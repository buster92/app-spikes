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

test("creator capabilities expose bounded data-only v0 runtime", () => {
  const capabilities = getRuntimeCapabilities();
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.runtime, "playloop-2d-v0");
  assert.equal(capabilities.schemaVersion, 1);
  assert.ok(capabilities.entityKinds.includes("sprite"));
  assert.ok(capabilities.events.includes("collision"));
  assert.ok(capabilities.actions.includes("spawn"));
  assert.equal(capabilities.expressions.entityReads, false);
  assert.equal(capabilities.sandbox.arbitraryCode, false);
  assert.equal(capabilities.sandbox.network, false);
  assert.equal(capabilities.assets.addressing, "sha256");
  assert.ok(capabilities.assets.maxTotalDecodedImageBytes > 0);
});

test("v1 capabilities explicitly expose entity reads and bounded local state", () => {
  const capabilities = getRuntimeCapabilities("playloop-2d-v1");
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.runtime, "playloop-2d-v1");
  assert.ok(capabilities.supportedRuntimes.includes("playloop-2d-v0"));
  assert.ok(capabilities.supportedRuntimes.includes("playloop-2d-v1"));
  assert.ok(capabilities.actions.includes("setEntityState"));
  assert.ok(capabilities.actions.includes("addEntityState"));
  assert.equal(capabilities.expressions.entityReads, true);
  assert.equal(capabilities.expressions.entityLocalState, true);
  assert.equal(capabilities.expressions.maxStateKeysPerEntity, 8);
  assert.ok(capabilities.expressions.entityFields.includes("x"));
  assert.equal(capabilities.sandbox.network, false);
});

test("unknown runtimes are rejected before authoring", () => {
  const capabilities = getRuntimeCapabilities("playloop-2d-v999");
  assert.equal(capabilities.ok, false);
  assert.equal(capabilities.diagnostics[0].code, "UNSUPPORTED_RUNTIME");

  const validation = validateForAuthoring({ runtime: "playloop-2d-v999" });
  assert.equal(validation.ok, false);
  assert.equal(validation.diagnostics[0].code, "UNSUPPORTED_RUNTIME");
});

test("author validation returns transport guidance for valid creator game", async () => {
  const result = validateForAuthoring(await example());
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.transport.instantEligible, true);
  assert.ok(result.transport.feedDescriptorBytes < 512);
  assert.equal(result.transport.declaredAssetBytes, 6700);
});

test("v1 author validation uses the same lightweight transport guidance", async () => {
  const result = validateForAuthoring(await example("garden-catch-v1"));
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.runtime, "playloop-2d-v1");
  assert.equal(result.transport.instantEligible, true);
  assert.ok(result.transport.feedDescriptorBytes < 512);
  assert.equal(result.transport.declaredAssetBytes, 5486);
  assert.ok(result.transport.firstPlayBytes < 32 * 1024);
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

test("v1 creator simulation routes through the v1 runtime review adapter", async () => {
  const result = simulateForAuthoring(await example("garden-catch-v1"), {
    seeds: [3, 11],
    maxSimulatedMs: 2000,
  });
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.validation.runtime, "playloop-2d-v1");
  assert.equal(result.summary.seeds, 2);
  assert.equal(result.summary.crashes, 0);
});

test("publication candidate hashes a valid v0 spec but never signs it client-side", async () => {
  const candidate = await buildPublicationCandidate(await example("tap-bloom"));
  assert.equal(candidate.ok, true, candidate.diagnostics.map((item) => item.message).join("\n"));
  assert.match(candidate.manifest.specRef, /^sha256:[0-9a-f]{64}$/);
  assert.equal(candidate.manifest.runtime, "playloop-2d-v0");
  assert.equal(Object.hasOwn(candidate.manifest, "signature"), false);
});

test("publication candidate can describe a v1 draft without expanding feed payload", async () => {
  const candidate = await buildPublicationCandidate(await example("garden-catch-v1"));
  assert.equal(candidate.ok, true, candidate.diagnostics.map((item) => item.message).join("\n"));
  assert.match(candidate.manifest.specRef, /^sha256:[0-9a-f]{64}$/);
  assert.equal(candidate.manifest.runtime, "playloop-2d-v1");
  assert.equal(candidate.manifest.assets.length, 2);
  assert.equal(candidate.manifest.instantEligible, true);
  assert.equal(Object.hasOwn(candidate.manifest, "signature"), false);
});
