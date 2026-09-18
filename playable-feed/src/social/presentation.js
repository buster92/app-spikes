import { formatMetric } from "./domain.js";

export function postPresentation({ post, creator, benchmark, liked, following }) {
  return {
    creatorLabel: `@${creator.handle}`,
    creatorName: creator.displayName,
    caption: post.caption,
    benchmarkLabel: benchmark ? `Creator: ${formatMetric(post.resultPolicy, benchmark)}` : "Open challenge",
    challengeLabel: benchmark ? `Can you beat ${formatMetric(post.resultPolicy, benchmark)}?` : "Set the first result",
    liked: liked === true,
    following: following === true,
    canFollow: creator.isLocal !== true,
  };
}

export function resultPresentation({ post, creator, playerResult, benchmark, comparison }) {
  const player = formatMetric(post.resultPolicy, playerResult);
  const creatorMetric = benchmark ? formatMetric(post.resultPolicy, benchmark) : null;
  let headline = "Run saved locally";
  if (comparison?.comparable && comparison.outcome === "win") headline = `You beat @${creator.handle}${comparison.delta ? ` by ${formatDelta(post.resultPolicy.kind, comparison.delta)}` : ""}`;
  if (comparison?.comparable && comparison.outcome === "loss") headline = `@${creator.handle} is still ahead${comparison.delta ? ` by ${formatDelta(post.resultPolicy.kind, comparison.delta)}` : ""}`;
  if (comparison?.comparable && comparison.outcome === "tie") headline = `You tied @${creator.handle}`;
  if (!comparison?.comparable && comparison?.reason === "incomplete") headline = "Finish the run to compare results";
  return { headline, playerLabel: `You: ${player}`, benchmarkLabel: creatorMetric ? `@${creator.handle}: ${creatorMetric}` : null, canChallenge: playerResult.status === "completed" };
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
    : `Beat ${benchmark}`;
  return { title, status, response: responseResult ? formatMetric(policy, responseResult) : null, canPlay: challenge.state === "open" };
}

export function publishValidation({ gameId, caption, benchmarkResultId }) {
  const errors = [];
  if (!gameId) errors.push("Choose a playable");
  if (typeof caption !== "string" || !caption.trim()) errors.push("Add a short challenge caption");
  if (caption?.trim().length > 180) errors.push("Caption must be 180 characters or fewer");
  if (!benchmarkResultId) errors.push("Complete the playable to establish your benchmark");
  return { valid: errors.length === 0, errors };
}
