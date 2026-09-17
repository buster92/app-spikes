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

test("public feed envelope is deterministic, content-addressed and still tiny", async () => {
  const spec = await example("space-dodge");
  const first = await buildPublicationEnvelope(spec);
  const second = await buildPublicationEnvelope(JSON.parse(JSON.stringify(spec)));

  assert.equal(first.manifestRef, second.manifestRef);
  assert.equal(first.manifestRef, await sha256Ref(first.manifest));
  assert.equal(first.feedDescriptor.manifestRef, first.manifestRef);
  assert.equal(first.feedDescriptor.specRef, first.manifest.specRef);
  assert.equal(first.feedDescriptor.assetCount, spec.assets.length);
  assert.equal(
    first.feedDescriptor.assetBytes,
    spec.assets.reduce((sum, asset) => sum + asset.bytes, 0),
  );
  assert.ok(first.feedDescriptorBytes < 512, `feed descriptor is ${first.feedDescriptorBytes} bytes`);
  assert.equal(canonicalJson(first.manifest), canonicalJson(second.manifest));
});
