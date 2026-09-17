import test from "node:test";
import assert from "node:assert/strict";

import { createAssetResidencyController, referencedImageRefs } from "../src/sandbox/asset-residency.js";

function game(id, refs) {
  return {
    id,
    assets: refs.map((ref, index) => ({ id: `asset-${index}`, kind: "image", ref })),
    entities: refs.map((ref, index) => ({ id: `sprite-${index}`, kind: "sprite", asset: `asset-${index}` })),
    templates: {},
  };
}

function fakeLoader({ failGameIds = [] } = {}) {
  const resident = new Set();
  const calls = [];
  return {
    calls,
    async preload(spec) {
      calls.push(["preload", spec.id]);
      if (failGameIds.includes(spec.id)) throw new Error(`budget rejected ${spec.id}`);
      for (const ref of referencedImageRefs(spec)) resident.add(ref);
      return { uniqueImages: referencedImageRefs(spec).length, decodedBytes: resident.size * 1024 };
    },
    releaseExcept(refs) {
      calls.push(["release", [...refs].sort()]);
      const keep = new Set(refs);
      for (const ref of [...resident]) if (!keep.has(ref)) resident.delete(ref);
    },
    stats() {
      return { decodedAssets: resident.size, refs: [...resident].sort() };
    },
  };
}

test("referencedImageRefs deduplicates atlas use and ignores unused assets", () => {
  const spec = {
    assets: [
      { id: "atlas", kind: "image", ref: "sha256:atlas" },
      { id: "unused", kind: "image", ref: "sha256:unused" },
    ],
    entities: [{ id: "player", kind: "sprite", asset: "atlas" }],
    templates: { hazard: { kind: "sprite", asset: "atlas" } },
  };
  assert.deepEqual(referencedImageRefs(spec), ["sha256:atlas"]);
});

test("residency keeps visible plus one successful prefetch and evicts prior cards", async () => {
  const loader = fakeLoader();
  const residency = createAssetResidencyController(loader, { maxPrefetchGames: 1 });
  const first = game("first", ["sha256:a"]);
  const second = game("second", ["sha256:b"]);
  const third = game("third", ["sha256:c"]);

  const initial = await residency.activate(first, { prefetch: [second, third] });
  assert.equal(initial.stale, false);
  assert.deepEqual(initial.activeRefs.sort(), ["sha256:a", "sha256:b"]);
  assert.equal(initial.prefetched.length, 1);
  assert.equal(initial.prefetched[0].gameId, "second");

  const next = await residency.activate(second, { prefetch: [third] });
  assert.equal(next.stale, false);
  assert.deepEqual(next.activeRefs.sort(), ["sha256:b", "sha256:c"]);
  assert.deepEqual(loader.stats().refs, ["sha256:b", "sha256:c"]);
});

test("failed prefetch never evicts the visible game's assets", async () => {
  const loader = fakeLoader({ failGameIds: ["heavy"] });
  const residency = createAssetResidencyController(loader, { maxPrefetchGames: 1 });
  const visible = game("visible", ["sha256:visible"]);
  const heavy = game("heavy", ["sha256:heavy"]);

  const result = await residency.activate(visible, { prefetch: [heavy] });
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].gameId, "heavy");
  assert.deepEqual(loader.stats().refs, ["sha256:visible"]);
});

test("releaseAll leaves no decoded creator images resident", async () => {
  const loader = fakeLoader();
  const residency = createAssetResidencyController(loader);
  await residency.activate(game("visible", ["sha256:a"]));
  residency.releaseAll();
  assert.deepEqual(loader.stats().refs, []);
  assert.deepEqual(residency.stats().activeRefs, []);
});
