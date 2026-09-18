import test from "node:test";
import assert from "node:assert/strict";
import { challengeOutcomePresentation, challengePresentation, nextPersistenceWarning, persistencePresentation, postPresentation, resultPresentation, publishValidation } from "../src/social/presentation.js";
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

test("anonymous presentation is a clean control without creator or social treatment", () => {
  const state = createSeedState();
  const post = state.posts[0]; const creator = state.profiles.find((item) => item.id === post.creatorId); const benchmark = state.results.find((item) => item.id === post.creatorResultId);
  const card = postPresentation({ post, creator, benchmark, liked: true, following: true, mode: "anonymous" });
  assert.equal(card.creatorLabel, null); assert.equal(card.caption, null); assert.equal(card.benchmarkLabel, null); assert.equal(card.showSocialActions, false);
  const result = resultPresentation({ post, creator, playerResult: { ...benchmark, actorId: "actor_local" }, benchmark, comparison: { comparable: true, outcome: "win", delta: 2 }, mode: "anonymous" });
  assert.equal(JSON.stringify(result).includes(creator.handle), false);
  assert.equal(result.showFollow, false); assert.equal(result.showLike, false); assert.equal(result.canChallenge, false);
});

test("completed challenge outcome and non-durable copy are explicit", () => {
  const state = createSeedState(); const challenge = state.challenges[0]; const source = state.posts.find((item) => item.id === challenge.sourcePostId);
  const challenger = state.profiles.find((item) => item.id === challenge.challengerId); const responder = state.profiles.find((item) => item.id === "actor_local");
  const challengerResult = state.results.find((item) => item.id === challenge.challengerResultId); const responseResult = { ...challengerResult, actorId: responder.id, metric: challengerResult.metric + 1 };
  const view = challengeOutcomePresentation({ challenger, responder, challengerResult, responseResult, policy: source.resultPolicy, comparison: { comparable: true, outcome: "win" }, playableTitle: "Game" });
  assert.match(view.title, /outcome/); assert.match(view.challengerLabel, /@/); assert.match(view.responderLabel, /@/); assert.match(view.verification, /Unverified/);
  assert.match(persistencePresentation(false, "result").warning, /this session/);
  assert.equal(persistencePresentation(true, "result").warning, null);
  assert.match(nextPersistenceWarning({ persisted: false }, "like"), /this session/);
  assert.equal(nextPersistenceWarning({ persisted: true }, "like"), null);
});

test("cancelled challenges have status copy without a dead action", () => {
  const state = createSeedState(); const challenge = { ...state.challenges[0], state: "cancelled" };
  const source = state.posts.find((item) => item.id === challenge.sourcePostId);
  const view = challengePresentation({ challenge, challenger: state.profiles.find((item) => item.id === challenge.challengerId), target: null, challengerResult: state.results.find((item) => item.id === challenge.challengerResultId), responseResult: null, policy: source.resultPolicy, comparison: null });
  assert.equal(view.status, "Cancelled");
  assert.equal(view.canPlay, false);
  assert.equal(view.canViewOutcome, false);
});

test("publish presentation requires selection, caption and actual benchmark", () => {
  assert.equal(publishValidation({ gameId: "meteor-dodge", caption: "Try this", benchmarkAttempt: {} }).valid, true);
  const invalid = publishValidation({ gameId: "", caption: "", benchmarkAttempt: null });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 3);
});


test("challenge presentation distinguishes pending outbound and completed open responses", () => {
  const state = createSeedState();
  const source = state.posts.find((item) => item.id === "post_maya_pattern");
  const challenger = state.profiles.find((item) => item.id === "actor_local");
  const target = state.profiles.find((item) => item.id === "creator_maya");
  const responder = state.profiles.find((item) => item.id === "creator_alex");
  const challengerResult = { ...state.results.find((item) => item.id === source.creatorResultId), actorId: challenger.id };

  const outbound = challengePresentation({
    challenge: { ...state.challenges[0], challengerId: challenger.id, targetActorId: target.id },
    challenger, target, responder: null, challengerResult, responseResult: null,
    policy: source.resultPolicy, comparison: null,
    capabilities: { isOutbound: true, canRespond: false, canViewOutcome: false },
  });
  assert.equal(outbound.status, `Waiting for @${target.handle}`);
  assert.equal(outbound.canPlay, false);

  const completedOpen = challengePresentation({
    challenge: { ...state.challenges[0], targetActorId: null, responderActorId: responder.id, state: "completed" },
    challenger: state.profiles.find((item) => item.id === "creator_maya"), target: null, responder,
    challengerResult: state.results.find((item) => item.id === source.creatorResultId),
    responseResult: { ...state.results.find((item) => item.id === source.creatorResultId), actorId: responder.id },
    policy: source.resultPolicy, comparison: { comparable: true, outcome: "win" },
    capabilities: { canRespond: false, canViewOutcome: true },
  });
  assert.match(completedOpen.title, /answered/);
  assert.equal(completedOpen.canViewOutcome, true);
});
