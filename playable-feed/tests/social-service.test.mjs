import test from "node:test";
import assert from "node:assert/strict";
import { CurrentActorProvider, LocalSocialRepository, normalizeSocialState } from "../src/social/repository.js";
import { SocialService } from "../src/social/service.js";

class MemoryStorage { constructor() { this.value = null; } getItem() { return this.value; } setItem(_key, value) { this.value = value; } }

function setup() {
  const repository = new LocalSocialRepository({ storage: new MemoryStorage() });
  const events = [];
  let sequence = 0;
  const service = new SocialService({
    repository,
    actorProvider: new CurrentActorProvider(repository),
    analytics: { log: (name, properties) => events.push({ name, ...properties, experiment_context: { social_frame_v1: "creator" } }) },
    now: () => "2026-09-18T10:00:00.000Z",
    idFactory: (prefix) => `${prefix}_test_${++sequence}`,
  });
  return { repository, service, events };
}

test("Discover is deterministic and Following contains only followed creators", () => {
  const { service } = setup();
  const discover = service.feed("discover");
  assert.equal(discover.length, 6);
  assert.deepEqual(discover.map((post) => post.id).slice(0, 2), ["post_maya_pattern", "post_alex_meteor"]);
  const following = service.feed("following");
  assert.ok(following.length > 0);
  assert.ok(following.every((post) => ["creator_maya", "creator_alex"].includes(post.creatorId)));
});

test("follow and unfollow update Following immediately and idempotently", () => {
  const { service, events } = setup();
  service.setFollow("creator_nova", true);
  service.setFollow("creator_nova", true);
  assert.ok(service.feed("following").some((post) => post.creatorId === "creator_nova"));
  assert.equal(service.state().follows.filter((item) => item.followedId === "creator_nova").length, 1);
  service.setFollow("creator_nova", false);
  service.setFollow("creator_nova", false);
  assert.equal(service.feed("following").some((post) => post.creatorId === "creator_nova"), false);
  assert.equal(events.filter((event) => event.name === "social_follow_changed").length, 2);
});

test("profile returns only that creator's published posts and derived counts", () => {
  const { service } = setup();
  const view = service.profile("creator_alex");
  assert.equal(view.posts.length, 2);
  assert.ok(view.posts.every((post) => post.creatorId === "creator_alex"));
  assert.equal(view.followers, 1);
  assert.deepEqual(view.posts.map((post) => post.id), ["post_alex_meteor", "post_alex_pattern"]);
});

test("like desired state is idempotent and persisted", () => {
  const { service, events } = setup();
  service.setLike("post_alex_meteor", true);
  service.setLike("post_alex_meteor", true);
  assert.equal(service.state().likes.filter((like) => like.postId === "post_alex_meteor" && like.actorId === "actor_local").length, 1);
  service.setLike("post_alex_meteor", false);
  assert.equal(service.isLiked("post_alex_meteor"), false);
  assert.equal(events.filter((event) => event.name === "social_like_changed").length, 2);
});

test("challenge roles prevent self-response and self-targeting", () => {
  const { service } = setup(); const source = service.post("post_alex_meteor");
  const run = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 47 });
  assert.throws(() => service.createChallenge({ postId: source.id, resultId: run.result.id, targetActorId: "actor_local" }), (error) => error.code === "invalid_challenge_actor");
  const own = service.createChallenge({ postId: source.id, resultId: run.result.id }).challenge;
  assert.equal(service.challengeCapabilities(own).canRespond, false);
  assert.throws(() => service.completeChallenge(own.id, run.result.id), (error) => error.code === "invalid_challenge_actor");
  assert.equal(service.challengeCapabilities(service.openChallenge("challenge_seed_open")).canRespond, true);
});

test("unknown post fails cleanly", () => {
  const { service } = setup();
  assert.throws(() => service.post("post_missing"), (error) => error.code === "unknown_post");
});

test("publishing an approved playable uses a transient benchmark, not an existing social result", () => {
  const { service } = setup();
  const source = service.post("post_alex_meteor");
  const attempt = service.createBenchmarkAttempt({ playableRef: source.playableRef, policy: source.resultPolicy, status: "completed", metric: 47 });
  assert.equal(service.state().results.some((item) => item.id === "attempt_local"), false);
  const lineage = { originalPostId: source.id, parentPostId: source.id, originalCreatorId: source.creatorId };
  const published = service.publish({ gameId: "meteor-dodge", caption: "Forty-seven. Your turn.", benchmarkAttempt: attempt, lineage });
  assert.equal(published.post.playableRef.specRef, source.playableRef.specRef);
  assert.deepEqual(published.post.lineage, lineage);
  assert.ok(service.feed("discover").some((post) => post.id === published.post.id));
  assert.ok(service.profile("actor_local").posts.some((post) => post.id === published.post.id));
  const copied = service.state().results.find((item) => item.id === published.post.creatorResultId);
  assert.equal(copied.postId, published.post.id);
  assert.equal(copied.actorId, "actor_local");
});

test("publishing rejects unapproved content and missing completed benchmark", () => {
  const { service } = setup();
  assert.throws(() => service.publish({ gameId: "arbitrary-js", caption: "unsafe", benchmarkAttempt: null }), (error) => error.code === "unapproved_playable");
  assert.throws(() => service.publish({ gameId: "meteor-dodge", caption: "No fake score", benchmarkAttempt: null }), (error) => error.code === "benchmark_required");
});

test("publishing rejects unverified or malformed benchmark attempts", () => {
  const { service } = setup();
  const source = service.post("post_alex_meteor");
  const base = { playableRef: source.playableRef, status: "completed", metric: 47, createdAt: "2026-09-18T10:00:00.000Z", verification: "unverified", replayEvidence: null };
  assert.throws(() => service.publish({ gameId: "meteor-dodge", caption: "Fixture score", benchmarkAttempt: base }), (error) => error.code === "benchmark_required");
  assert.throws(() => service.publish({ gameId: "meteor-dodge", caption: "Bad attempt", benchmarkAttempt: { ...base, verification: "trusted_shell_local", metric: null } }), (error) => error.code === "benchmark_required");
  assert.throws(() => service.publish({ gameId: "meteor-dodge", caption: "Wrong game", benchmarkAttempt: { ...base, verification: "trusted_shell_local", playableRef: { ...base.playableRef, seed: 999 } } }), (error) => error.code === "benchmark_required");
});

test("inbound challenge captures exact reference and can be completed by the local actor", () => {
  const { service } = setup();
  const challenge = service.openChallenge("challenge_seed_open"); const source = service.post(challenge.sourcePostId);
  const response = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 6000 });
  const completed = service.completeChallenge(challenge.id, response.result.id);
  assert.equal(completed.comparison.outcome, "win");
  assert.equal(service.openChallenge(challenge.id).responseResultId, response.result.id);
  assert.equal(service.openChallenge(challenge.id).targetActorId, "actor_local");
  assert.equal(service.openChallenge(challenge.id).responderActorId, "actor_local");
});

test("open challenge completion binds responder and remains valid under another current actor", () => {
  const { repository, service } = setup();
  repository.transaction((state) => { state.challenges[0].targetActorId = null; });
  const challenge = service.openChallenge("challenge_seed_open");
  const source = service.post(challenge.sourcePostId);
  const response = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 6200 });
  service.completeChallenge(challenge.id, response.result.id);
  const completed = service.state().challenges.find((item) => item.id === challenge.id);
  assert.equal(completed.targetActorId, null);
  assert.equal(completed.responderActorId, "actor_local");
  const historical = { ...service.state(), actorId: "creator_alex" };
  assert.doesNotThrow(() => normalizeSocialState(historical));
});

test("challenge response cannot silently change revision or actor", () => {
  const { service } = setup();
  const source = service.post("post_alex_meteor");
  const run = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 47 });
  const challenge = service.createChallenge({ postId: source.id, resultId: run.result.id, targetActorId: "creator_alex" }).challenge;
  assert.throws(() => service.recordResult({ postId: source.id, playableRef: { ...source.playableRef, seed: 999 }, status: "completed", metric: 55 }), (error) => error.code === "playable_mismatch");
  const wrongActor = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 55 });
  assert.throws(() => service.completeChallenge(challenge.id, wrongActor.result.id), (error) => error.code === "invalid_challenge_actor");
});

test("challenge creation rejects failed and same-playable attempts from another post", () => {
  const { service } = setup();
  const patternPosts = service.state().posts.filter((item) => item.playableRef.gameId === "pattern-echo-v2");
  assert.equal(patternPosts.length, 2);
  const failed = service.recordResult({ postId: patternPosts[0].id, playableRef: patternPosts[0].playableRef, status: "failed", metric: null });
  assert.throws(() => service.createChallenge({ postId: patternPosts[0].id, resultId: failed.result.id }), (error) => error.code === "invalid_challenge_result");
  const completed = service.recordResult({ postId: patternPosts[0].id, playableRef: patternPosts[0].playableRef, status: "completed", metric: 1000 });
  assert.throws(() => service.createChallenge({ postId: patternPosts[1].id, resultId: completed.result.id }), (error) => error.code === "invalid_challenge_result");
  assert.equal(service.createChallenge({ postId: patternPosts[0].id, resultId: completed.result.id }).challenge.sourcePostId, patternPosts[0].id);
});

test("outbound challenge cannot be completed by its challenger", () => {
  const { service } = setup();
  const patternPosts = service.state().posts.filter((item) => item.playableRef.gameId === "pattern-echo-v2");
  const run = service.recordResult({ postId: patternPosts[0].id, playableRef: patternPosts[0].playableRef, status: "completed", metric: 1000 });
  const challenge = service.createChallenge({ postId: patternPosts[0].id, resultId: run.result.id, targetActorId: "creator_alex" }).challenge;
  const own = service.recordResult({ postId: patternPosts[0].id, playableRef: patternPosts[0].playableRef, status: "completed", metric: 900 });
  assert.throws(() => service.completeChallenge(challenge.id, own.result.id), (error) => error.code === "invalid_challenge_actor");
});

test("failed persistence preserves usable in-memory mutations and honest status", () => {
  const repository = new LocalSocialRepository({ storage: { getItem: () => null, setItem: () => { throw new Error("quota"); } } });
  const service = new SocialService({ repository, actorProvider: new CurrentActorProvider(repository), now: () => "2026-09-18T10:00:00.000Z", idFactory: (prefix) => `${prefix}_memory` });
  const source = service.post("post_alex_meteor");
  const liked = service.setLike(source.id, true);
  const run = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 47 });
  assert.equal(liked.persisted, false); assert.equal(run.persisted, false);
  assert.equal(service.isLiked(source.id), true);
  assert.equal(service.state().results.some((item) => item.id === run.result.id), true);
  assert.equal(run.result.verification, "trusted_shell_local");
});

test("social analytics stay centralized, preserve context and exclude caption text", () => {
  const { service, events } = setup();
  const source = service.post("post_alex_meteor");
  const caption = "private free-form challenge words";
  const attempt = service.createBenchmarkAttempt({ playableRef: source.playableRef, policy: source.resultPolicy, status: "completed", metric: 47 });
  service.publish({ gameId: "meteor-dodge", caption, benchmarkAttempt: attempt });
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(caption), false);
  assert.ok(events.some((event) => event.name === "social_publish_completed"));
  assert.ok(events.every((event) => event.experiment_context.social_frame_v1 === "creator"));
  assert.equal(service.state().posts.at(-1).caption, caption);
  service.feed("discover"); service.profile("creator_alex");
  assert.equal(events.some((event) => event.name === "social_feed_viewed" || event.name === "social_profile_opened"), false);
});


test("newly published posts appear first on the creator profile", () => {
  const { service } = setup();
  const source = service.post("post_alex_meteor");
  const attempt = service.createBenchmarkAttempt({ playableRef: source.playableRef, policy: source.resultPolicy, status: "completed", metric: 52 });
  const published = service.publish({ gameId: "meteor-dodge", caption: "Newest local challenge", benchmarkAttempt: attempt });
  assert.equal(service.profile("actor_local").posts[0].id, published.post.id);
});

test("cancelling a challenge does not emit a challenge-opened event", () => {
  const { service, events } = setup();
  const source = service.post("post_alex_meteor");
  const run = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 47 });
  const challenge = service.createChallenge({ postId: source.id, resultId: run.result.id }).challenge;
  const before = events.filter((event) => event.name === "social_challenge_opened").length;
  service.cancelChallenge(challenge.id);
  assert.equal(events.filter((event) => event.name === "social_challenge_opened").length, before);
});
