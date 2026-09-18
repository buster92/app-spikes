import test from "node:test";
import assert from "node:assert/strict";
import { resultPresentation, publishValidation } from "../src/social/presentation.js";
import { createSeedState } from "../src/social/fixtures.js";

test("result presentation explains a valid social comparison without color", () => {
  const state = createSeedState();
  const post = state.posts.find((item) => item.id === "post_alex_meteor");
  const benchmark = state.results.find((item) => item.id === post.creatorResultId);
  const playerResult = { ...benchmark, id: "result_player", actorId: "actor_local", metric: 47 };
  const view = resultPresentation({ post, creator: state.profiles.find((item) => item.id === post.creatorId), playerResult, benchmark, comparison: { comparable: true, outcome: "win", delta: 6 } });
  assert.equal(view.headline, "You beat @alexloops by 6 points");
  assert.equal(view.canChallenge, true);
});

test("publish presentation requires selection, caption and actual benchmark", () => {
  assert.equal(publishValidation({ gameId: "meteor-dodge", caption: "Try this", benchmarkResultId: "result_x" }).valid, true);
  const invalid = publishValidation({ gameId: "", caption: "", benchmarkResultId: null });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 3);
});
