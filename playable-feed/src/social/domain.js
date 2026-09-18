const ID = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
export const RESULT_POLICY_KINDS = Object.freeze([
  "higher_score",
  "lower_time",
  "lower_moves",
  "completion_then_higher_score",
  "completion_then_lower_time",
  "completion_then_lower_moves",
]);

export class SocialDomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SocialDomainError";
    this.code = code;
  }
}

function requiredId(value, field) {
  if (typeof value !== "string" || !ID.test(value)) throw new SocialDomainError("invalid_id", `${field} is invalid`);
  return value;
}

function boundedText(value, field, max, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new SocialDomainError("invalid_text", `${field} must contain 1-${max} characters`);
  }
  return value.trim();
}

export function validatePlayableRef(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) throw new SocialDomainError("invalid_playable_ref", "PlayableRef is required");
  const value = {
    runtime: boundedText(ref.runtime, "runtime", 64),
    gameId: requiredId(ref.gameId, "gameId"),
    manifestVersion: Number(ref.manifestVersion),
    manifestRef: ref.manifestRef,
    specRef: ref.specRef,
    seed: Number(ref.seed),
  };
  if (!Number.isInteger(value.manifestVersion) || value.manifestVersion < 1) throw new SocialDomainError("invalid_playable_ref", "manifestVersion must be a positive integer");
  if (!HASH.test(value.manifestRef || "") || !HASH.test(value.specRef || "")) throw new SocialDomainError("invalid_playable_ref", "PlayableRef requires content-addressed manifest and spec refs");
  if (!Number.isSafeInteger(value.seed) || value.seed < 0) throw new SocialDomainError("invalid_playable_ref", "PlayableRef seed must be a non-negative safe integer");
  return Object.freeze(value);
}

export function playableRefKey(ref) {
  const value = validatePlayableRef(ref);
  return `${value.runtime}|${value.gameId}|${value.manifestVersion}|${value.manifestRef}|${value.specRef}|${value.seed}`;
}

export function samePlayableRef(a, b) {
  try { return playableRefKey(a) === playableRefKey(b); } catch { return false; }
}

export function validateResultPolicy(policy) {
  if (!policy || typeof policy !== "object" || !RESULT_POLICY_KINDS.includes(policy.kind)) {
    throw new SocialDomainError("unsupported_result_policy", "ResultPolicy kind is unsupported");
  }
  return Object.freeze({ kind: policy.kind });
}

export function validatePlayResult(result) {
  if (!result || typeof result !== "object") throw new SocialDomainError("invalid_result", "PlayResult is required");
  const status = result.status;
  if (!["completed", "failed"].includes(status)) throw new SocialDomainError("invalid_result", "Result status must be completed or failed");
  const metric = result.metric === null || result.metric === undefined ? null : Number(result.metric);
  if (metric !== null && (!Number.isFinite(metric) || metric < 0)) throw new SocialDomainError("invalid_result", "Result metric must be finite and non-negative");
  const verification = result.verification || "unverified";
  if (!["unverified", "trusted_shell_local"].includes(verification)) throw new SocialDomainError("invalid_result", "Result verification state is unsupported");
  return {
    ...result,
    id: requiredId(result.id, "result.id"),
    actorId: requiredId(result.actorId, "result.actorId"),
    postId: requiredId(result.postId, "result.postId"),
    playableRef: validatePlayableRef(result.playableRef),
    status,
    metric,
    verification,
    sourceResultId: result.sourceResultId ? requiredId(result.sourceResultId, "result.sourceResultId") : null,
  };
}

export function resultHasRequiredMetric(policyInput, resultInput) {
  validateResultPolicy(policyInput);
  const result = validatePlayResult(resultInput);
  return result.status === "completed" && result.metric !== null;
}

function compareScalar(player, benchmark, lowerWins) {
  if (player.metric === null || benchmark.metric === null) return { comparable: false, outcome: "incomparable", delta: null };
  if (player.metric === benchmark.metric) return { comparable: true, outcome: "tie", delta: 0 };
  const playerWins = lowerWins ? player.metric < benchmark.metric : player.metric > benchmark.metric;
  return { comparable: true, outcome: playerWins ? "win" : "loss", delta: Math.abs(player.metric - benchmark.metric) };
}

export function compareResults(policyInput, playerInput, benchmarkInput) {
  const policy = validateResultPolicy(policyInput);
  const player = validatePlayResult(playerInput);
  const benchmark = validatePlayResult(benchmarkInput);
  if (!samePlayableRef(player.playableRef, benchmark.playableRef)) return { comparable: false, outcome: "incomparable", reason: "playable_mismatch", delta: null };

  const completionFirst = policy.kind.startsWith("completion_then_");
  if (completionFirst && player.status !== benchmark.status) {
    return { comparable: true, outcome: player.status === "completed" ? "win" : "loss", reason: "completion", delta: null };
  }
  if (!completionFirst && (player.status !== "completed" || benchmark.status !== "completed")) {
    return { comparable: false, outcome: "incomparable", reason: "incomplete", delta: null };
  }
  if (player.status !== "completed" && benchmark.status !== "completed") return { comparable: false, outcome: "incomparable", reason: "both_failed", delta: null };
  const lowerWins = policy.kind.endsWith("lower_time") || policy.kind.endsWith("lower_moves") || policy.kind === "lower_time" || policy.kind === "lower_moves";
  return { ...compareScalar(player, benchmark, lowerWins), reason: "metric" };
}

export function validateProfile(profile) {
  if (!profile || typeof profile !== "object") throw new SocialDomainError("invalid_profile", "CreatorProfile is required");
  const handle = boundedText(profile.handle, "handle", 24).toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(handle)) throw new SocialDomainError("invalid_profile", "Profile handle is invalid");
  return {
    id: requiredId(profile.id, "profile.id"),
    handle,
    displayName: boundedText(profile.displayName, "displayName", 48),
    avatar: boundedText(profile.avatar, "avatar", 8),
    bio: boundedText(profile.bio, "bio", 160, { optional: true }),
    badge: boundedText(profile.badge, "badge", 32, { optional: true }),
    isLocal: profile.isLocal === true,
  };
}

export function validatePost(post) {
  if (!post || typeof post !== "object") throw new SocialDomainError("invalid_post", "PlayablePost is required");
  const lineage = post.lineage || null;
  return {
    ...post,
    id: requiredId(post.id, "post.id"),
    creatorId: requiredId(post.creatorId, "post.creatorId"),
    createdAt: boundedText(post.createdAt, "createdAt", 40),
    caption: boundedText(post.caption, "caption", 180),
    playableRef: validatePlayableRef(post.playableRef),
    resultPolicy: validateResultPolicy(post.resultPolicy),
    creatorResultId: post.creatorResultId ? requiredId(post.creatorResultId, "creatorResultId") : null,
    status: post.status === "published" ? "published" : (() => { throw new SocialDomainError("invalid_post", "Post must be published"); })(),
    lineage: lineage ? {
      originalPostId: requiredId(lineage.originalPostId, "lineage.originalPostId"),
      parentPostId: lineage.parentPostId ? requiredId(lineage.parentPostId, "lineage.parentPostId") : null,
      originalCreatorId: requiredId(lineage.originalCreatorId, "lineage.originalCreatorId"),
    } : null,
    preview: post.preview && typeof post.preview === "object" ? { kind: post.preview.kind || "poster", tone: post.preview.tone || "violet" } : null,
  };
}

export function validateChallenge(challenge) {
  if (!challenge || typeof challenge !== "object") throw new SocialDomainError("invalid_challenge", "Challenge is required");
  const state = challenge.state;
  if (!["open", "completed", "cancelled"].includes(state)) throw new SocialDomainError("invalid_challenge", "Challenge state is invalid");
  return {
    ...challenge,
    id: requiredId(challenge.id, "challenge.id"),
    challengerId: requiredId(challenge.challengerId, "challenge.challengerId"),
    targetActorId: challenge.targetActorId ? requiredId(challenge.targetActorId, "challenge.targetActorId") : null,
    sourcePostId: requiredId(challenge.sourcePostId, "challenge.sourcePostId"),
    playableRef: validatePlayableRef(challenge.playableRef),
    challengerResultId: requiredId(challenge.challengerResultId, "challenge.challengerResultId"),
    responseResultId: challenge.responseResultId ? requiredId(challenge.responseResultId, "challenge.responseResultId") : null,
    state,
    createdAt: boundedText(challenge.createdAt, "challenge.createdAt", 40),
  };
}

export function formatMetric(policyInput, resultInput) {
  const policy = validateResultPolicy(policyInput);
  const result = validatePlayResult(resultInput);
  if (result.status !== "completed") return "Did not finish";
  if (result.metric === null) return "Completed";
  if (policy.kind.endsWith("lower_time") || policy.kind === "lower_time") return `${(result.metric / 1000).toFixed(1)}s`;
  if (policy.kind.endsWith("lower_moves") || policy.kind === "lower_moves") return `${result.metric} moves`;
  return `${result.metric} pts`;
}
