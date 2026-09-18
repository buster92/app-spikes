import { formatMetric } from "./domain.js";

export function verificationLabel(result) {
  if (!result) return null;
  if (result.verification === "trusted_shell_local") return "Recorded on this device · not server verified";
  return "Unverified result";
}

export function persistencePresentation(persisted, subject = "change") {
  return persisted === false
    ? { durable: false, warning: `Your ${subject} is available this session, but device storage is unavailable.` }
    : { durable: true, warning: null };
}

export function postPresentation({ post, creator, benchmark, liked, following, mode = "creator" }) {
  if (mode === "anonymous") return {
    creatorLabel: null, creatorName: null, caption: null,
    benchmarkLabel: null, challengeLabel: "Ready when you are",
    liked: false, following: false, canFollow: false, showSocialActions: false,
  };
  return {
    creatorLabel: `@${creator.handle}`,
    creatorName: creator.displayName,
    caption: post.caption,
    benchmarkLabel: benchmark ? `Creator: ${formatMetric(post.resultPolicy, benchmark)}` : "Open challenge",
    challengeLabel: benchmark ? `Can you beat ${formatMetric(post.resultPolicy, benchmark)}?` : "Set the first result",
    liked: liked === true,
    following: following === true,
    canFollow: creator.isLocal !== true,
    showSocialActions: true,
  };
}

export function resultPresentation({ post, creator, playerResult, benchmark, comparison, mode = "creator", persisted = true }) {
  const player = formatMetric(post.resultPolicy, playerResult);
  if (mode === "anonymous") return {
    headline: playerResult.status === "completed" ? "Run complete" : "Run ended",
    playerLabel: `You: ${player}`, benchmarkLabel: null, canChallenge: false,
    showFollow: false, showLike: false, verificationLabel: verificationLabel(playerResult),
    persistenceWarning: persistencePresentation(persisted, "result").warning,
  };
  const creatorMetric = benchmark ? formatMetric(post.resultPolicy, benchmark) : null;
  let headline = persisted === false ? "Run complete" : "Run saved on this device";
  if (comparison?.comparable && comparison.outcome === "win") headline = `You beat @${creator.handle}${comparison.delta ? ` by ${formatDelta(post.resultPolicy.kind, comparison.delta)}` : ""}`;
  if (comparison?.comparable && comparison.outcome === "loss") headline = `@${creator.handle} is still ahead${comparison.delta ? ` by ${formatDelta(post.resultPolicy.kind, comparison.delta)}` : ""}`;
  if (comparison?.comparable && comparison.outcome === "tie") headline = `You tied @${creator.handle}`;
  if (!comparison?.comparable && comparison?.reason === "incomplete") headline = "Finish the run to compare results";
  return { headline, playerLabel: `You: ${player}`, benchmarkLabel: creatorMetric ? `@${creator.handle}: ${creatorMetric}` : null, canChallenge: playerResult.status === "completed" && playerResult.metric !== null, showFollow: creator.isLocal !== true, showLike: true, verificationLabel: verificationLabel(playerResult), persistenceWarning: persistencePresentation(persisted, "result").warning };
}

function formatDelta(kind, delta) {
  if (kind.includes("time")) return `${(delta / 1000).toFixed(1)}s`;
  if (kind.includes("moves")) return `${delta} move${delta === 1 ? "" : "s"}`;
  return `${delta} point${delta === 1 ? "" : "s"}`;
}

export function challengePresentation({ challenge, challenger, target, challengerResult, responseResult, policy, comparison }) {
  const title = target ? `@${challenger.handle} challenged @${target.handle}` : `Open challenge from @${challenger.handle}`;
  const benchmark = formatMetric(policy, challengerResult);
  const status = challenge.state === "completed"
    ? `Completed · ${comparison?.outcome || "recorded"}`
    : challenge.state === "cancelled" ? "Cancelled" : `Beat ${benchmark}`;
  return { title, status, response: responseResult ? formatMetric(policy, responseResult) : null, canPlay: challenge.state === "open", canViewOutcome: challenge.state === "completed" };
}

export function challengeOutcomePresentation({ challenger, responder, challengerResult, responseResult, policy, comparison, playableTitle }) {
  const outcome = comparison?.outcome === "win" ? `@${responder.handle} won`
    : comparison?.outcome === "loss" ? `@${challenger.handle} won`
      : comparison?.outcome === "tie" ? "The challenge ended in a tie" : "Results cannot be compared";
  return {
    title: `${playableTitle} challenge outcome`,
    outcome,
    challengerLabel: `@${challenger.handle}: ${formatMetric(policy, challengerResult)}`,
    responderLabel: `@${responder.handle}: ${formatMetric(policy, responseResult)}`,
    verification: `${verificationLabel(challengerResult)} · ${verificationLabel(responseResult)}`,
  };
}

export function publishValidation({ gameId, caption, benchmarkResultId }) {
  const errors = [];
  if (!gameId) errors.push("Choose a playable");
  if (typeof caption !== "string" || !caption.trim()) errors.push("Add a short challenge caption");
  if (caption?.trim().length > 180) errors.push("Caption must be 180 characters or fewer");
  if (!benchmarkResultId) errors.push("Complete the playable to establish your benchmark");
  return { valid: errors.length === 0, errors };
}
