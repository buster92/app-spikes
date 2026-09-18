import { createSeedState } from "./fixtures.js";
import { resultHasRequiredMetric, samePlayableRef, validateChallenge, validatePlayResult, validatePost, validateProfile } from "./domain.js";

export const SOCIAL_STORAGE_KEY = "playloop.social.v1";
export const SOCIAL_SCHEMA_VERSION = 1;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function uniqueMap(items, key, label) {
  const map = new Map();
  for (const item of items) {
    const value = key(item);
    if (map.has(value)) throw new Error(`duplicate ${label} ${value}`);
    map.set(value, item);
  }
  return map;
}

function normalizeEdgeList(candidate, { label, key, validate }) {
  if (!Array.isArray(candidate)) throw new Error(`${label} must be an array`);
  const values = candidate.map((item) => {
    if (!item || typeof item !== "object" || !validate(item)) throw new Error(`${label} has invalid references`);
    return { ...item };
  });
  uniqueMap(values, key, label);
  return values;
}

export function normalizeSocialState(candidate) {
  if (!candidate || typeof candidate !== "object" || candidate.schemaVersion !== SOCIAL_SCHEMA_VERSION) throw new Error("unsupported social schema");
  if (![candidate.profiles, candidate.posts, candidate.results, candidate.challenges].every(Array.isArray)) throw new Error("social collections must be arrays");

  const profiles = candidate.profiles.map(validateProfile);
  const profileById = uniqueMap(profiles, (profile) => profile.id, "profile id");
  uniqueMap(profiles, (profile) => profile.handle, "profile handle");
  const posts = candidate.posts.map(validatePost);
  const postById = uniqueMap(posts, (post) => post.id, "post id");
  const results = candidate.results.map(validatePlayResult);
  const resultById = uniqueMap(results, (result) => result.id, "result id");
  const challenges = candidate.challenges.map(validateChallenge);
  uniqueMap(challenges, (challenge) => challenge.id, "challenge id");

  if (!profileById.has(candidate.actorId)) throw new Error("current actor is unknown");
  if ([...posts, ...results, ...challenges].some((item) => item.createdAt === null)) throw new Error("persisted social timestamps are required");

  for (const result of results) {
    const resultPost = postById.get(result.postId);
    if (!profileById.has(result.actorId) || !resultPost) throw new Error(`result ${result.id} has broken references`);
    if (!samePlayableRef(result.playableRef, resultPost.playableRef)) throw new Error(`result ${result.id} playable does not match post`);
  }

  for (const post of posts) {
    if (!profileById.has(post.creatorId)) throw new Error(`post ${post.id} has unknown creator`);
    if (post.creatorResultId) {
      const benchmark = resultById.get(post.creatorResultId);
      if (!benchmark) throw new Error(`post ${post.id} has unknown benchmark`);
      if (benchmark.actorId !== post.creatorId || benchmark.postId !== post.id || !samePlayableRef(benchmark.playableRef, post.playableRef)) throw new Error(`post ${post.id} benchmark is incoherent`);
      if (!resultHasRequiredMetric(post.resultPolicy, benchmark)) throw new Error(`post ${post.id} benchmark is not publication eligible`);
    }
    if (post.lineage) {
      const original = postById.get(post.lineage.originalPostId);
      const parent = post.lineage.parentPostId ? postById.get(post.lineage.parentPostId) : null;
      if (!original || !profileById.has(post.lineage.originalCreatorId) || original.creatorId !== post.lineage.originalCreatorId) throw new Error(`post ${post.id} has broken original lineage`);
      if (post.lineage.parentPostId && !parent) throw new Error(`post ${post.id} has broken parent lineage`);
      if (parent?.lineage && parent.lineage.originalPostId !== post.lineage.originalPostId) throw new Error(`post ${post.id} lineage disagrees with parent`);
    }
  }

  for (const challenge of challenges) {
    const sourcePost = postById.get(challenge.sourcePostId);
    const challengerResult = resultById.get(challenge.challengerResultId);
    if (!profileById.has(challenge.challengerId)) throw new Error(`challenge ${challenge.id} has unknown challenger`);
    if (challenge.targetActorId && !profileById.has(challenge.targetActorId)) throw new Error(`challenge ${challenge.id} has unknown target`);
    if (challenge.targetActorId === challenge.challengerId) throw new Error(`challenge ${challenge.id} targets its challenger`);
    if (!sourcePost || !samePlayableRef(challenge.playableRef, sourcePost.playableRef)) throw new Error(`challenge ${challenge.id} source playable is incoherent`);
    if (!challengerResult || challengerResult.actorId !== challenge.challengerId || challengerResult.postId !== challenge.sourcePostId || !samePlayableRef(challengerResult.playableRef, challenge.playableRef) || !resultHasRequiredMetric(sourcePost.resultPolicy, challengerResult)) throw new Error(`challenge ${challenge.id} challenger result is incoherent`);
    const response = challenge.responseResultId ? resultById.get(challenge.responseResultId) : null;
    if (challenge.state === "open" && response) throw new Error(`open challenge ${challenge.id} cannot have a response`);
    if (challenge.state === "completed" && !response) throw new Error(`completed challenge ${challenge.id} requires a response`);
    if (challenge.state === "cancelled" && response) throw new Error(`cancelled challenge ${challenge.id} cannot have a response`);
    if (response) {
      const expectedActor = challenge.targetActorId || candidate.actorId;
      if (response.actorId !== expectedActor || response.actorId === challenge.challengerId || response.postId !== challenge.sourcePostId || !samePlayableRef(response.playableRef, challenge.playableRef) || !resultHasRequiredMetric(sourcePost.resultPolicy, response)) throw new Error(`challenge ${challenge.id} response is incoherent`);
    }
  }

  const likes = normalizeEdgeList(candidate.likes, { label: "like", key: (like) => `${like.actorId}|${like.postId}`, validate: (like) => profileById.has(like.actorId) && postById.has(like.postId) });
  const follows = normalizeEdgeList(candidate.follows, { label: "follow", key: (follow) => `${follow.followerId}|${follow.followedId}`, validate: (follow) => profileById.has(follow.followerId) && profileById.has(follow.followedId) && follow.followerId !== follow.followedId });
  return { schemaVersion: SOCIAL_SCHEMA_VERSION, actorId: candidate.actorId, profiles, posts, results, challenges, likes, follows };
}

function browserStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export class LocalSocialRepository {
  constructor(options = {}) {
    this.storage = Object.hasOwn(options, "storage") ? options.storage : browserStorage();
    this.key = options.key || SOCIAL_STORAGE_KEY;
    this.seedFactory = options.seedFactory || createSeedState;
    this.recovered = false;
    this.persistenceAvailable = Boolean(this.storage);
    this.state = this.#load();
  }

  #load() {
    if (this.storage) {
      try {
        const raw = this.storage.getItem(this.key);
        if (raw) return normalizeSocialState(JSON.parse(raw));
      } catch {
        this.recovered = true;
      }
    }
    const seeded = normalizeSocialState(this.seedFactory());
    this.#write(seeded);
    return seeded;
  }

  #write(state) {
    if (!this.storage) {
      this.persistenceAvailable = false;
      return false;
    }
    try {
      this.storage.setItem(this.key, JSON.stringify(state));
      this.persistenceAvailable = true;
      return true;
    } catch {
      this.persistenceAvailable = false;
      return false;
    }
  }

  snapshot() { return clone(this.state); }

  transaction(change) {
    const draft = clone(this.state);
    const value = change(draft);
    const normalized = normalizeSocialState(draft);
    this.state = normalized;
    const persisted = this.#write(normalized);
    return { value, persisted, state: this.snapshot() };
  }
}

export class CurrentActorProvider {
  constructor(repository) { this.repository = repository; }
  getActorId() { return this.repository.snapshot().actorId; }
  getProfile() {
    const state = this.repository.snapshot();
    return state.profiles.find((profile) => profile.id === state.actorId) || null;
  }
}
