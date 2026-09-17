import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  buildPublicationCandidate,
  getRuntimeCapabilities,
  simulateForAuthoring,
  validateForAuthoring,
} from "../src/sandbox/creator-tools.js";
import { buildPublicationEnvelope, canonicalJson, sha256Ref } from "../src/sandbox/transport.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function busEscape() {
  return JSON.parse(await readFile(resolve(root, "examples/bus-escape-v3.game.json"), "utf8"));
}

test("v3 creator capabilities expose bounded grid primitives without host authority", () => {
  const capabilities = getRuntimeCapabilities("playloop-2d-v3");
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.runtime, "playloop-2d-v3");
  assert.ok(capabilities.supportedRuntimes.includes("playloop-2d-v3"));
  assert.equal(capabilities.expressions.grids, true);
  assert.deepEqual(
    capabilities.expressions.gridOps,
    ["isCellFree", "canMoveBy", "pathClearToEdge", "column", "row"],
  );
  assert.equal(capabilities.expressions.maxGrids, 4);
  assert.equal(capabilities.expressions.maxGridColumns, 10);
  assert.equal(capabilities.expressions.maxGridRows, 10);
  assert.equal(capabilities.expressions.maxCellsPerGrid, 64);
  assert.equal(capabilities.expressions.maxGridSpan, 4);
  assert.ok(capabilities.actions.includes("moveGridEntity"));
  assert.ok(capabilities.actions.includes("moveGridBy"));
  assert.equal(capabilities.sandbox.arbitraryCode, false);
  assert.equal(capabilities.sandbox.network, false);
  assert.equal(capabilities.sandbox.filesystem, false);
  assert.equal(capabilities.sandbox.socialApi, false);
  assert.equal(capabilities.sandbox.payments, false);
});

test("v3 author validation reaches the versioned transport adapter", async () => {
  const result = validateForAuthoring(await busEscape());
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.runtime, "playloop-2d-v3");
  assert.equal(result.transport.feedDescriptor.runtime, "playloop-2d-v3");
  assert.equal(result.transport.instantEligible, true);
  assert.equal(result.transport.declaredAssetBytes, 0);
  assert.ok(result.transport.feedDescriptorBytes < 512);
  assert.ok(result.transport.firstPlayBytes < 16 * 1024);
});

test("v3 creator simulation routes through automated runtime review", async () => {
  const result = simulateForAuthoring(await busEscape(), {
    seeds: [3, 11],
    maxSimulatedMs: 3500,
  });
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.validation.runtime, "playloop-2d-v3");
  assert.equal(result.stage, "automated_runtime_review");
  assert.equal(result.summary.seeds, 2);
  assert.equal(result.summary.crashes, 0);
  assert.ok(result.summary.peakOps > 0);
});

test("v3 publication candidate preserves the runtime and remains unsigned client-side", async () => {
  const candidate = await buildPublicationCandidate(await busEscape());
  assert.equal(candidate.ok, true, candidate.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(candidate.manifest.runtime, "playloop-2d-v3");
  assert.match(candidate.manifest.specRef, /^sha256:[0-9a-f]{64}$/);
  assert.equal(candidate.manifest.assets.length, 0);
  assert.equal(candidate.manifest.instantEligible, true);
  assert.equal(Object.hasOwn(candidate.manifest, "signature"), false);
});

test("v3 public feed envelope is deterministic content-addressed and tiny", async () => {
  const spec = await busEscape();
  const first = await buildPublicationEnvelope(spec);
  const second = await buildPublicationEnvelope(JSON.parse(JSON.stringify(spec)));

  assert.equal(first.manifest.runtime, "playloop-2d-v3");
  assert.equal(first.manifestRef, second.manifestRef);
  assert.equal(first.manifestRef, await sha256Ref(first.manifest));
  assert.equal(first.feedDescriptor.manifestRef, first.manifestRef);
  assert.equal(first.feedDescriptor.specRef, first.manifest.specRef);
  assert.equal(first.feedDescriptor.runtime, "playloop-2d-v3");
  assert.equal(first.feedDescriptor.assetBytes, 0);
  assert.equal(first.feedDescriptor.assetCount, 0);
  assert.equal(first.feedDescriptor.instantEligible, true);
  assert.ok(first.feedDescriptorBytes < 512, `feed descriptor is ${first.feedDescriptorBytes} bytes`);
  assert.equal(canonicalJson(first.manifest), canonicalJson(second.manifest));
});

test("Creator Lab and package scripts explicitly dispatch v3", async () => {
  const lab = await readFile(resolve(root, "src/sandbox/creator-lab.js"), "utf8");
  const html = await readFile(resolve(root, "creator-lab.html"), "utf8");
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

  assert.match(lab, /RUNTIME_V3_ID/);
  assert.match(lab, /SafeSandboxRuntimeV3/);
  assert.match(lab, /bus-escape-v3/);
  assert.match(html, /GameSpec v3 draft/);
  assert.match(html, /value="bus-escape-v3"/);

  assert.match(pkg.scripts["review:v3"], /review-v3-cli/);
  assert.match(pkg.scripts["replay:v3"], /replay-v3-cli/);
  assert.match(pkg.scripts["creator:validate:v3"], /bus-escape-v3/);
  assert.match(pkg.scripts["creator:simulate:v3"], /bus-escape-v3/);
  assert.match(pkg.scripts["creator:manifest:v3"], /bus-escape-v3/);
  assert.match(pkg.scripts.check, /game-spec-v3\.js/);
  assert.match(pkg.scripts.check, /runtime-v3\.js/);
  assert.match(pkg.scripts.check, /review-v3-cli\.mjs/);
  assert.match(pkg.scripts.check, /replay-v3-cli\.mjs/);
});
