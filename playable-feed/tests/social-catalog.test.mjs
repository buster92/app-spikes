import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { BUNDLED_PLAYABLES, playableRefFor } from "../src/social/catalog.js";
import { buildPublicationEnvelope } from "../src/sandbox/transport.js";
import { samePlayableRef } from "../src/social/domain.js";
import { normalizeRuntimeResult } from "../src/social/playable-host.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("approved social catalog refs match publication-valid bundled GameSpecs", async () => {
  for (const item of BUNDLED_PLAYABLES) {
    const spec = JSON.parse(await readFile(resolve(root, item.path.replace(/^\.\//, "")), "utf8"));
    const envelope = await buildPublicationEnvelope(spec);
    const resolved = {
      runtime: envelope.feedDescriptor.runtime,
      gameId: envelope.feedDescriptor.gameId,
      manifestVersion: envelope.feedDescriptor.manifestVersion,
      manifestRef: envelope.feedDescriptor.manifestRef,
      specRef: envelope.feedDescriptor.specRef,
      seed: item.seed,
    };
    assert.equal(samePlayableRef(resolved, playableRefFor(item)), true, `${item.id} trusted refs drifted`);
  }
});

test("runtime normalization uses only trusted policy-specific terminal fields", () => {
  const snapshot = { status: "complete", elapsedMs: 9999, result: { score: 47, elapsedMs: 6300 }, variables: { moves: 18 } };
  assert.deepEqual(normalizeRuntimeResult({ kind: "higher_score" }, snapshot), { status: "completed", metric: 47 });
  assert.deepEqual(normalizeRuntimeResult({ kind: "lower_time" }, snapshot), { status: "completed", metric: 6300 });
  assert.deepEqual(normalizeRuntimeResult({ kind: "lower_moves" }, snapshot), { status: "completed", metric: 18 });
});
