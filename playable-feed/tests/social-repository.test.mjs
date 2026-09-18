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

test("a throwing localStorage getter falls back to usable in-memory state", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });
  try {
    const repository = new LocalSocialRepository();
    assert.equal(repository.persistenceAvailable, false);
    assert.equal(repository.snapshot().posts.length, 6);
    const changed = repository.transaction((state) => state.likes.push({ actorId: "actor_local", postId: "post_alex_meteor" }));
    assert.equal(changed.persisted, false);
    assert.equal(repository.snapshot().likes.some((item) => item.postId === "post_alex_meteor"), true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else delete globalThis.localStorage;
  }
});

function malformedMutation(mutate) {
  const initial = new LocalSocialRepository({ storage: new MemoryStorage() }).snapshot();
  mutate(initial);
  const storage = new MemoryStorage({ [SOCIAL_STORAGE_KEY]: JSON.stringify(initial) });
  const repository = new LocalSocialRepository({ storage });
  assert.equal(repository.recovered, true);
  assert.equal(repository.snapshot().posts.length, 6);
}

const corruptions = [
  ["unknown challenge challenger", (state) => { state.challenges[0].challengerId = "missing"; }],
  ["unknown challenge target", (state) => { state.challenges[0].targetActorId = "missing"; }],
  ["post benchmark actor mismatch", (state) => { state.results.find((item) => item.id === state.posts[0].creatorResultId).actorId = "actor_local"; }],
  ["post benchmark post mismatch", (state) => { state.results.find((item) => item.id === state.posts[0].creatorResultId).postId = state.posts[1].id; }],
  ["post benchmark playable mismatch", (state) => { state.results.find((item) => item.id === state.posts[0].creatorResultId).playableRef.seed += 1; }],
  ["result playable differs from post", (state) => { state.results[0].playableRef.seed += 1; }],
  ["challenge result wrong actor", (state) => { state.results.find((item) => item.id === state.challenges[0].challengerResultId).actorId = "actor_local"; }],
  ["challenge result wrong post", (state) => { state.results.find((item) => item.id === state.challenges[0].challengerResultId).postId = state.posts[1].id; }],
  ["challenge playable differs from post", (state) => { state.challenges[0].playableRef.seed += 1; }],
  ["completed challenge missing response", (state) => { state.challenges[0].state = "completed"; }],
  ["broken original lineage", (state) => { state.posts.find((item) => item.lineage).lineage.originalPostId = "missing"; }],
  ["duplicate profile id", (state) => { state.profiles.push(structuredClone(state.profiles[0])); }],
  ["duplicate profile handle", (state) => { state.profiles[1].handle = state.profiles[0].handle; }],
  ["duplicate post id", (state) => { state.posts.push(structuredClone(state.posts[0])); }],
  ["duplicate result id", (state) => { state.results.push(structuredClone(state.results[0])); }],
  ["duplicate challenge id", (state) => { state.challenges.push(structuredClone(state.challenges[0])); }],
  ["duplicate like", (state) => { state.likes.push(structuredClone(state.likes[0])); }],
  ["duplicate follow", (state) => { state.follows.push(structuredClone(state.follows[0])); }],
];

for (const [name, mutate] of corruptions) test(`malformed persisted state recovers: ${name}`, () => malformedMutation(mutate));

test("malformed completed challenge responses recover for actor, post, and playable mismatches", () => {
  for (const kind of ["actor", "post", "playable"]) malformedMutation((state) => {
    const challenge = state.challenges[0]; const source = state.results.find((item) => item.id === challenge.challengerResultId);
    const response = structuredClone(source); response.id = `response_${kind}`; response.actorId = "actor_local";
    if (kind === "actor") response.actorId = "creator_alex";
    if (kind === "post") response.postId = state.posts[1].id;
    if (kind === "playable") response.playableRef.seed += 1;
    state.results.push(response); challenge.state = "completed"; challenge.responseResultId = response.id;
  });
});

test("fixture benchmarks are explicitly unverified", () => {
  const state = new LocalSocialRepository({ storage: new MemoryStorage() }).snapshot();
  assert.ok(state.results.length > 0);
  assert.ok(state.results.every((item) => item.verification === "unverified"));
});
