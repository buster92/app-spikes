import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import { buildPublicationEnvelope, canonicalJson, sha256Ref } from "../src/sandbox/transport.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function example(name) {
  return JSON.parse(await readFile(resolve(root, `examples/${name}.game.json`), "utf8"));
}

async function assertTinyDeterministicEnvelope(name, runtime) {
  const spec = await example(name);
  const first = await buildPublicationEnvelope(spec);
  const second = await buildPublicationEnvelope(JSON.parse(JSON.stringify(spec)));

  assert.equal(first.manifestRef, second.manifestRef);
  assert.equal(first.manifestRef, await sha256Ref(first.manifest));
  assert.equal(first.feedDescriptor.manifestRef, first.manifestRef);
  assert.equal(first.feedDescriptor.specRef, first.manifest.specRef);
  assert.equal(first.feedDescriptor.runtime, runtime);
  assert.equal(first.feedDescriptor.assetCount, spec.assets.length);
  assert.equal(
    first.feedDescriptor.assetBytes,
    spec.assets.reduce((sum, asset) => sum + asset.bytes, 0),
  );
  assert.ok(first.feedDescriptorBytes < 512, `feed descriptor is ${first.feedDescriptorBytes} bytes`);
  assert.equal(canonicalJson(first.manifest), canonicalJson(second.manifest));
  return first;
}

test("v0 public feed envelope is deterministic, content-addressed and tiny", async () => {
  await assertTinyDeterministicEnvelope("space-dodge", "playloop-2d-v0");
});

test("v1 draft uses the same tiny post envelope while richer game data stays lazy", async () => {
  const envelope = await assertTinyDeterministicEnvelope("garden-catch-v1", "playloop-2d-v1");
  assert.equal(envelope.feedDescriptor.assetBytes, 5486);
  assert.equal(envelope.feedDescriptor.assetCount, 2);
  assert.equal(envelope.feedDescriptor.instantEligible, true);
});
