import { createSeedState } from "./fixtures.js";
import { validateChallenge, validatePlayResult, validatePost, validateProfile } from "./domain.js";

export const SOCIAL_STORAGE_KEY = "playloop.social.v1";
export const SOCIAL_SCHEMA_VERSION = 1;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function normalizeState(candidate) {
  if (!candidate || typeof candidate !== "object" || candidate.schemaVersion !== SOCIAL_SCHEMA_VERSION) throw new Error("unsupported social schema");
  const profiles = candidate.profiles.map(validateProfile);
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const posts = candidate.posts.map(validatePost);
  const postIds = new Set(posts.map((post) => post.id));
  const results = candidate.results.map(validatePlayResult);
  const resultIds = new Set(results.map((result) => result.id));
  const challenges = candidate.challenges.map(validateChallenge);
  if (!profileIds.has(candidate.actorId)) throw new Error("current actor is unknown");
  for (const post of posts) {
    if (!profileIds.has(post.creatorId)) throw new Error(`post ${post.id} has unknown creator`);
    if (post.creatorResultId && !resultIds.has(post.creatorResultId)) throw new Error(`post ${post.id} has unknown benchmark`);
  }
  for (const result of results) if (!profileIds.has(result.actorId) || !postIds.has(result.postId)) throw new Error(`result ${result.id} has broken references`);
  for (const challenge of challenges) {
    if (!postIds.has(challenge.sourcePostId) || !resultIds.has(challenge.challengerResultId)) throw new Error(`challenge ${challenge.id} has broken references`);
  }
  const likes = Array.isArray(candidate.likes) ? candidate.likes.filter((like) => profileIds.has(like.actorId) && postIds.has(like.postId)) : [];
  const follows = Array.isArray(candidate.follows) ? candidate.follows.filter((follow) => profileIds.has(follow.followerId) && profileIds.has(follow.followedId) && follow.followerId !== follow.followedId) : [];
  return { schemaVersion: SOCIAL_SCHEMA_VERSION, actorId: candidate.actorId, profiles, posts, results, challenges, likes, follows };
}

export class LocalSocialRepository {
  constructor({ storage = globalThis.localStorage, key = SOCIAL_STORAGE_KEY, seedFactory = createSeedState } = {}) {
    this.storage = storage;
    this.key = key;
    this.seedFactory = seedFactory;
    this.recovered = false;
    this.persistenceAvailable = true;
    this.state = this.#load();
  }

  #load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch {
      this.recovered = true;
    }
    const seeded = normalizeState(this.seedFactory());
    this.#write(seeded);
    return seeded;
  }

  #write(state) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(state));
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
    const normalized = normalizeState(draft);
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
