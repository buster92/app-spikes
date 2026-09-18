import test from "node:test";
import assert from "node:assert/strict";
import { LocalSocialRepository, SOCIAL_STORAGE_KEY } from "../src/social/repository.js";

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.writes = 0; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
}

test("initial seed is deterministic and written once", () => {
  const storage = new MemoryStorage();
  const first = new LocalSocialRepository({ storage });
  assert.equal(first.snapshot().profiles.length, 6);
  assert.equal(first.snapshot().posts.length, 6);
  assert.equal(storage.writes, 1);
});

test("reload does not duplicate seed fixtures", () => {
  const storage = new MemoryStorage();
  const first = new LocalSocialRepository({ storage }).snapshot();
  const second = new LocalSocialRepository({ storage }).snapshot();
  assert.deepEqual(second, first);
  assert.equal(second.posts.length, 6);
});

test("likes, follows, posts, challenges and results persist across reload", () => {
  const storage = new MemoryStorage();
  const repository = new LocalSocialRepository({ storage });
  repository.transaction((state) => {
    state.likes.push({ actorId: "actor_local", postId: "post_alex_meteor" });
    state.follows.push({ followerId: "actor_local", followedId: "creator_nova" });
    const templateResult = structuredClone(state.results[0]); templateResult.id = "result_persist"; state.results.push(templateResult);
    const templatePost = structuredClone(state.posts[0]); templatePost.id = "post_persist"; templatePost.creatorResultId = "result_persist"; templateResult.postId = "post_persist"; state.posts.push(templatePost);
    const templateChallenge = structuredClone(state.challenges[0]); templateChallenge.id = "challenge_persist"; templateChallenge.sourcePostId = "post_persist"; templateChallenge.challengerResultId = "result_persist"; state.challenges.push(templateChallenge);
  });
  const reloaded = new LocalSocialRepository({ storage }).snapshot();
  assert.ok(reloaded.likes.some((item) => item.postId === "post_alex_meteor"));
  assert.ok(reloaded.follows.some((item) => item.followedId === "creator_nova"));
  assert.ok(reloaded.posts.some((item) => item.id === "post_persist"));
  assert.ok(reloaded.challenges.some((item) => item.id === "challenge_persist"));
  assert.ok(reloaded.results.some((item) => item.id === "result_persist"));
});

test("malformed storage recovers to one clean seed world", () => {
  const storage = new MemoryStorage({ [SOCIAL_STORAGE_KEY]: "{broken" });
  const repository = new LocalSocialRepository({ storage });
  assert.equal(repository.recovered, true);
  assert.equal(repository.snapshot().posts.length, 6);
  assert.doesNotThrow(() => JSON.parse(storage.getItem(SOCIAL_STORAGE_KEY)));
});

test("unknown schema version recovers safely", () => {
  const storage = new MemoryStorage({ [SOCIAL_STORAGE_KEY]: JSON.stringify({ schemaVersion: 99 }) });
  const repository = new LocalSocialRepository({ storage });
  assert.equal(repository.recovered, true);
  assert.equal(repository.snapshot().schemaVersion, 1);
});

test("persistence failure keeps the in-memory session usable", () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  const repository = new LocalSocialRepository({ storage });
  const transaction = repository.transaction((state) => state.likes.push({ actorId: "actor_local", postId: "post_alex_meteor" }));
  assert.equal(transaction.persisted, false);
  assert.equal(repository.persistenceAvailable, false);
  assert.ok(repository.snapshot().likes.some((item) => item.postId === "post_alex_meteor"));
});
