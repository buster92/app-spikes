import { bundledPlayable, playableRefFor } from "./catalog.js";
import { compareResults, samePlayableRef, SocialDomainError, validatePlayResult, validatePost } from "./domain.js";

function defaultId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class SocialService {
  constructor({ repository, actorProvider, analytics = null, now = () => new Date().toISOString(), idFactory = defaultId } = {}) {
    if (!repository || !actorProvider) throw new TypeError("SocialService requires repository and actor provider");
    this.repository = repository;
    this.actorProvider = actorProvider;
    this.analytics = analytics;
    this.now = now;
    this.idFactory = idFactory;
  }

  log(name, properties) { this.analytics?.log?.(name, properties); }
  state() { return this.repository.snapshot(); }
  actorId() { return this.actorProvider.getActorId(); }

  profile(profileId) {
    const state = this.state();
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) throw new SocialDomainError("unknown_profile", `Unknown profile ${profileId}`);
    const actorId = this.actorId();
    const posts = state.posts.filter((post) => post.creatorId === profileId && post.status === "published");
    const followers = new Set(state.follows.filter((follow) => follow.followedId === profileId).map((follow) => follow.followerId)).size;
    this.log("social_profile_opened", { profile_id: profileId, is_self: profileId === actorId });
    return { profile, posts, followers, following: state.follows.some((follow) => follow.followerId === actorId && follow.followedId === profileId) };
  }

  post(postId) {
    const post = this.state().posts.find((item) => item.id === postId);
    if (!post) throw new SocialDomainError("unknown_post", `Unknown or deleted post ${postId}`);
    return post;
  }

  feed(scope = "discover") {
    const state = this.state();
    const actorId = this.actorId();
    let posts = state.posts.filter((post) => post.status === "published");
    if (scope === "following") {
      const followed = new Set(state.follows.filter((follow) => follow.followerId === actorId).map((follow) => follow.followedId));
      posts = posts.filter((post) => followed.has(post.creatorId));
    } else if (scope !== "discover") {
      throw new SocialDomainError("invalid_feed_scope", `Unsupported feed scope ${scope}`);
    }
    posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    this.log("social_feed_viewed", { scope, post_count: posts.length });
    return posts;
  }

  isLiked(postId) { return this.state().likes.some((like) => like.actorId === this.actorId() && like.postId === postId); }
  setLike(postId, liked) {
    this.post(postId);
    const actorId = this.actorId();
    const desired = liked === true;
    const transaction = this.repository.transaction((state) => {
      const index = state.likes.findIndex((like) => like.actorId === actorId && like.postId === postId);
      if (desired && index < 0) state.likes.push({ actorId, postId });
      if (!desired && index >= 0) state.likes.splice(index, 1);
      return desired;
    });
    this.log("social_like_changed", { post_id: postId, liked: desired });
    return { liked: desired, persisted: transaction.persisted };
  }

  isFollowing(profileId) { return this.state().follows.some((follow) => follow.followerId === this.actorId() && follow.followedId === profileId); }
  setFollow(profileId, following) {
    const profile = this.state().profiles.find((item) => item.id === profileId);
    if (!profile) throw new SocialDomainError("unknown_profile", `Unknown profile ${profileId}`);
    const actorId = this.actorId();
    if (profile.id === actorId) throw new SocialDomainError("invalid_follow", "You cannot follow yourself");
    const desired = following === true;
    const transaction = this.repository.transaction((state) => {
      const index = state.follows.findIndex((follow) => follow.followerId === actorId && follow.followedId === profileId);
      if (desired && index < 0) state.follows.push({ followerId: actorId, followedId: profileId });
      if (!desired && index >= 0) state.follows.splice(index, 1);
      return desired;
    });
    this.log("social_follow_changed", { profile_id: profileId, following: desired });
    return { following: desired, persisted: transaction.persisted };
  }

  recordResult({ postId, playableRef, status, metric, actorId = this.actorId(), replayEvidence = null }) {
    const post = this.post(postId);
    if (!samePlayableRef(post.playableRef, playableRef)) throw new SocialDomainError("playable_mismatch", "Result does not target the post's immutable playable revision and seed");
    const result = validatePlayResult({ id: this.idFactory("result"), actorId, postId, playableRef, status, metric, createdAt: this.now(), verification: "trusted_shell_local", replayEvidence });
    const transaction = this.repository.transaction((state) => state.results.push(result));
    this.log("social_post_play_result", { post_id: postId, game_id: playableRef.gameId, runtime: playableRef.runtime, outcome: status, policy: post.resultPolicy.kind, verification: result.verification });
    return { result, persisted: transaction.persisted };
  }

  comparisonFor(postId, resultId) {
    const state = this.state();
    const post = this.post(postId);
    const result = state.results.find((item) => item.id === resultId);
    if (!result) throw new SocialDomainError("unknown_result", `Unknown result ${resultId}`);
    const benchmark = state.results.find((item) => item.id === post.creatorResultId);
    if (!benchmark) return { comparable: false, outcome: "incomparable", reason: "no_benchmark", delta: null };
    return compareResults(post.resultPolicy, result, benchmark);
  }

  createChallenge({ postId, resultId, targetActorId = null }) {
    const state = this.state();
    const post = this.post(postId);
    const result = state.results.find((item) => item.id === resultId && item.actorId === this.actorId());
    if (!result || !samePlayableRef(result.playableRef, post.playableRef)) throw new SocialDomainError("invalid_challenge_result", "Challenge requires your result from this exact playable revision and seed");
    if (targetActorId && !state.profiles.some((profile) => profile.id === targetActorId)) throw new SocialDomainError("unknown_profile", "Challenge target is unknown");
    const challenge = { id: this.idFactory("challenge"), challengerId: this.actorId(), targetActorId, sourcePostId: postId, playableRef: post.playableRef, challengerResultId: resultId, responseResultId: null, state: "open", createdAt: this.now() };
    const transaction = this.repository.transaction((draft) => draft.challenges.push(challenge));
    this.log("social_challenge_created", { challenge_id: challenge.id, post_id: postId, game_id: post.playableRef.gameId, targeted: Boolean(targetActorId), verification: result.verification });
    return { challenge, persisted: transaction.persisted };
  }

  challenges() {
    const actorId = this.actorId();
    return this.state().challenges.filter((challenge) => challenge.challengerId === actorId || challenge.targetActorId === actorId || challenge.targetActorId === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  openChallenge(challengeId) {
    const state = this.state();
    const challenge = state.challenges.find((item) => item.id === challengeId);
    if (!challenge) throw new SocialDomainError("invalid_challenge", "Challenge no longer exists");
    const post = state.posts.find((item) => item.id === challenge.sourcePostId);
    if (!post || !samePlayableRef(post.playableRef, challenge.playableRef)) throw new SocialDomainError("playable_mismatch", "Challenge playable no longer matches its source post");
    this.log("social_challenge_opened", { challenge_id: challengeId, state: challenge.state, game_id: challenge.playableRef.gameId });
    return challenge;
  }

  completeChallenge(challengeId, responseResultId) {
    const state = this.state();
    const challenge = this.openChallenge(challengeId);
    if (challenge.state !== "open") throw new SocialDomainError("invalid_challenge", "Challenge is not open");
    const response = state.results.find((item) => item.id === responseResultId);
    const challenger = state.results.find((item) => item.id === challenge.challengerResultId);
    if (!response || !challenger || !samePlayableRef(response.playableRef, challenge.playableRef)) throw new SocialDomainError("playable_mismatch", "Challenge response must use the exact challenge playable revision and seed");
    const expectedActor = challenge.targetActorId || this.actorId();
    if (response.actorId !== expectedActor) throw new SocialDomainError("invalid_challenge_actor", "Challenge response actor does not match the target");
    const post = this.post(challenge.sourcePostId);
    const comparison = compareResults(post.resultPolicy, response, challenger);
    const transaction = this.repository.transaction((draft) => {
      const item = draft.challenges.find((entry) => entry.id === challengeId);
      item.responseResultId = responseResultId;
      item.state = "completed";
    });
    this.log("social_challenge_completed", { challenge_id: challengeId, post_id: post.id, outcome: comparison.outcome, policy: post.resultPolicy.kind });
    return { comparison, persisted: transaction.persisted };
  }

  publish({ gameId, caption, benchmarkResultId, lineage = null }) {
    this.log("social_publish_started", { game_id: gameId });
    try {
      const catalog = bundledPlayable(gameId);
      if (!catalog) throw new SocialDomainError("unapproved_playable", "Choose an approved bundled playable");
      const playableRef = playableRefFor(catalog);
      const state = this.state();
      const benchmark = state.results.find((item) => item.id === benchmarkResultId && item.actorId === this.actorId());
      if (!benchmark || !samePlayableRef(benchmark.playableRef, playableRef) || benchmark.status !== "completed") throw new SocialDomainError("benchmark_required", "Complete this playable before publishing its challenge");
      const postId = this.idFactory("post");
      const post = validatePost({ id: postId, creatorId: this.actorId(), createdAt: this.now(), caption, playableRef, resultPolicy: catalog.policy, creatorResultId: benchmark.id, status: "published", lineage, preview: { kind: "poster", tone: "violet" } });
      const transaction = this.repository.transaction((draft) => {
        draft.posts.push(post);
        const result = draft.results.find((item) => item.id === benchmark.id);
        result.postId = postId;
      });
      this.log("social_publish_completed", { post_id: post.id, game_id: gameId, runtime: playableRef.runtime, policy: post.resultPolicy.kind, has_lineage: Boolean(lineage) });
      return { post, persisted: transaction.persisted };
    } catch (error) {
      this.log("social_publish_failed", { game_id: gameId || null, reason: error?.code || "invalid_publication" });
      throw error;
    }
  }
}
