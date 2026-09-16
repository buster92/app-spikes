import test from "node:test";
import assert from "node:assert/strict";

import { buildDeck, clamp, hashString, mulberry32, nextDifficulty } from "../src/feed.js";
import { GAME_DEFINITIONS } from "../src/games.js";

test("catalog contains a useful first-spike variety", () => {
  assert.ok(GAME_DEFINITIONS.length >= 10, "expected at least ten distinct mechanics");
  const ids = GAME_DEFINITIONS.map((game) => game.id);
  assert.equal(new Set(ids).size, ids.length, "game ids must be unique");
  const categories = new Set(GAME_DEFINITIONS.map((game) => game.category));
  assert.ok(categories.size >= 6, "catalog should not be ten versions of one mechanic");
});

test("buildDeck uses every mechanic exactly once per cycle", () => {
  const deck = buildDeck(GAME_DEFINITIONS, { cycle: 0, sessionSeed: "tester", difficulty: 2 });
  assert.equal(deck.length, GAME_DEFINITIONS.length);
  assert.deepEqual(new Set(deck.map((game) => game.id)), new Set(GAME_DEFINITIONS.map((game) => game.id)));
  assert.equal(new Set(deck.map((game) => game.variantId)).size, deck.length);
});

test("the same session/cycle is deterministic while the next cycle varies", () => {
  const a = buildDeck(GAME_DEFINITIONS, { cycle: 1, sessionSeed: "abc", difficulty: 3 });
  const b = buildDeck(GAME_DEFINITIONS, { cycle: 1, sessionSeed: "abc", difficulty: 3 });
  const c = buildDeck(GAME_DEFINITIONS, { cycle: 2, sessionSeed: "abc", difficulty: 3 });

  assert.deepEqual(a.map(({ id, variantId }) => [id, variantId]), b.map(({ id, variantId }) => [id, variantId]));
  assert.notDeepEqual(a.map((game) => game.variantId), c.map((game) => game.variantId));
});

test("every game can create sane variants across difficulty levels", () => {
  for (const difficulty of [1, 3, 5]) {
    for (const definition of GAME_DEFINITIONS) {
      const seed = hashString(`${definition.id}:${difficulty}`);
      const variant = definition.createVariant({ random: mulberry32(seed), seed, cycle: difficulty, difficulty });
      assert.equal(typeof variant, "object", `${definition.id} should return a variant`);
      assert.equal(variant.difficulty, difficulty, `${definition.id} should retain difficulty`);
      assert.match(variant.accent, /^#[0-9a-f]{6}$/i);
      assert.match(variant.accent2, /^#[0-9a-f]{6}$/i);
      assert.match(variant.background, /^#[0-9a-f]{6}$/i);
      assert.equal(typeof definition.mount, "function");
    }
  }
});

test("adaptive difficulty only moves after useful evidence and stays bounded", () => {
  assert.equal(nextDifficulty(2, ["complete"]), 2);
  assert.equal(nextDifficulty(2, ["complete", "complete", "complete"]), 3);
  assert.equal(nextDifficulty(5, ["complete", "complete", "complete"]), 5);
  assert.equal(nextDifficulty(3, ["fail", "complete", "fail"]), 2);
  assert.equal(nextDifficulty(1, ["fail", "fail"]), 1);
  assert.equal(nextDifficulty(4, ["skip", "skip", "skip"]), 4);
});

test("helpers stay deterministic and bounded", () => {
  assert.equal(clamp(-1, 1, 5), 1);
  assert.equal(clamp(9, 1, 5), 5);
  assert.equal(clamp(3, 1, 5), 3);
  assert.equal(hashString("playloop"), hashString("playloop"));
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert.deepEqual(Array.from({ length: 10 }, () => a()), Array.from({ length: 10 }, () => b()));
});
