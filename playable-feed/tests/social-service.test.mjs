import test from "node:test";
import assert from "node:assert/strict";
import { CurrentActorProvider, LocalSocialRepository } from "../src/social/repository.js";
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
  const { service } = setup();
  service.setFollow("creator_nova", true);
  service.setFollow("creator_nova", true);
  assert.ok(service.feed("following").some((post) => post.creatorId === "creator_nova"));
  assert.equal(service.state().follows.filter((item) => item.followedId === "creator_nova").length, 1);
  service.setFollow("creator_nova", false);
  service.setFollow("creator_nova", false);
  assert.equal(service.feed("following").some((post) => post.creatorId === "creator_nova"), false);
});

test("profile returns only that creator's published posts and derived counts", () => {
  const { service } = setup();
  const view = service.profile("creator_alex");
  assert.equal(view.posts.length, 2);
  assert.ok(view.posts.every((post) => post.creatorId === "creator_alex"));
  assert.equal(view.followers, 1);
});

test("like desired state is idempotent and persisted", () => {
  const { service } = setup();
  service.setLike("post_alex_meteor", true);
  service.setLike("post_alex_meteor", true);
  assert.equal(service.state().likes.filter((like) => like.postId === "post_alex_meteor" && like.actorId === "actor_local").length, 1);
  service.setLike("post_alex_meteor", false);
  assert.equal(service.isLiked("post_alex_meteor"), false);
});

test("unknown post fails cleanly", () => {
  const { service } = setup();
  assert.throws(() => service.post("post_missing"), (error) => error.code === "unknown_post");
});

test("publishing approved playable stores immutable ref, lineage and makes post visible", () => {
  const { service } = setup();
  const source = service.post("post_alex_meteor");
  const run = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 47 });
  const lineage = { originalPostId: source.id, parentPostId: source.id, originalCreatorId: source.creatorId };
  const published = service.publish({ gameId: "meteor-dodge", caption: "Forty-seven. Your turn.", benchmarkResultId: run.result.id, lineage });
  assert.equal(published.post.playableRef.specRef, source.playableRef.specRef);
  assert.deepEqual(published.post.lineage, lineage);
  assert.ok(service.feed("discover").some((post) => post.id === published.post.id));
  assert.ok(service.profile("actor_local").posts.some((post) => post.id === published.post.id));
});

test("publishing rejects unapproved content and missing completed benchmark", () => {
  const { service } = setup();
  assert.throws(() => service.publish({ gameId: "arbitrary-js", caption: "unsafe", benchmarkResultId: "result_none" }), (error) => error.code === "unapproved_playable");
  assert.throws(() => service.publish({ gameId: "meteor-dodge", caption: "No fake score", benchmarkResultId: "result_alex_meteor" }), (error) => error.code === "benchmark_required");
});

test("challenge captures exact reference and seed, persists, completes with policy outcome", () => {
  const { service } = setup();
  const source = service.post("post_alex_meteor");
  const challengerRun = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 47 });
  const created = service.createChallenge({ postId: source.id, resultId: challengerRun.result.id, targetActorId: "creator_alex" });
  assert.deepEqual(created.challenge.playableRef, source.playableRef);
  assert.equal(created.challenge.playableRef.seed, source.playableRef.seed);
  const response = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 52, actorId: "creator_alex" });
  const completed = service.completeChallenge(created.challenge.id, response.result.id);
  assert.equal(completed.comparison.outcome, "win");
  assert.equal(service.openChallenge(created.challenge.id).responseResultId, response.result.id);
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

test("social analytics stay centralized, preserve context and exclude caption text", () => {
  const { service, events } = setup();
  const source = service.post("post_alex_meteor");
  const caption = "private free-form challenge words";
  const run = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: "completed", metric: 47 });
  service.publish({ gameId: "meteor-dodge", caption, benchmarkResultId: run.result.id });
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(caption), false);
  assert.ok(events.some((event) => event.name === "social_publish_completed"));
  assert.ok(events.every((event) => event.experiment_context.social_frame_v1 === "creator"));
  assert.equal(service.state().posts.at(-1).caption, caption);
});
