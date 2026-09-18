import { logProductEvent } from "./analytics.js";

const EVENTS_KEY = "playloop.events.v1";
const LIKES_KEY = "playloop.likes.v1";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readEvents() {
  const value = readJson(EVENTS_KEY, []);
  return Array.isArray(value) ? value : [];
}

function appendEvent(name, properties = {}) {
  return logProductEvent(name, {
    source: "round3_ui",
    ...properties,
  });
}

const shell = document.querySelector("#appShell");
const result = document.querySelector("#resultOverlay");
const resultActions = result?.querySelector(".result-actions");
const retryButton = document.querySelector("#retryButton");
const nextButton = document.querySelector("#nextButton");

// Large reinforcement surface. This is intentionally more visible than the old
// small record pill: early playtests showed that real level/record events were
// happening but the player did not perceive them.
const rewardBurst = document.createElement("div");
rewardBurst.className = "reward-burst";
rewardBurst.setAttribute("aria-live", "polite");
rewardBurst.innerHTML = "<strong></strong><span></span>";
shell?.append(rewardBurst);
const rewardTitle = rewardBurst.querySelector("strong");
const rewardDetail = rewardBurst.querySelector("span");
const rewardQueue = [];
let rewardTimer = null;
let rewardBusy = false;

function showNextReward() {
  if (rewardBusy || rewardQueue.length === 0) return;
  rewardBusy = true;
  const item = rewardQueue.shift();
  rewardTitle.textContent = item.title;
  rewardDetail.textContent = item.detail;
  rewardBurst.classList.add("is-visible");
  navigator.vibrate?.(item.haptic || [8, 24, 8]);
  appendEvent("reward_feedback_shown", { reward_type: item.type, value: item.value ?? null });

  clearTimeout(rewardTimer);
  rewardTimer = setTimeout(() => {
    rewardBurst.classList.remove("is-visible");
    setTimeout(() => {
      rewardBusy = false;
      showNextReward();
    }, 180);
  }, item.duration || 1450);
}

function enqueueReward(item) {
  rewardQueue.push(item);
  showNextReward();
}

function recordLabel(type) {
  return ({
    bestXp: "XP RECORD",
    bestStreak: "STREAK RECORD",
    bestDifficulty: "LEVEL RECORD",
    longestRun: "RUN RECORD",
  })[type] || "NEW RECORD";
}

function recordValue(type, value) {
  if (type === "bestDifficulty") return `LV ${value}`;
  if (type === "bestStreak") return `🔥 ${value}`;
  if (type === "longestRun") return `${value} games`;
  return `${value} XP`;
}

// Like is attached to the result state rather than the live game surface so it
// never competes with a mini-game's controls or the feed swipe gesture.
const likeButton = document.createElement("button");
likeButton.type = "button";
likeButton.className = "like-button";
likeButton.textContent = "♡ Like";
likeButton.hidden = true;
if (resultActions) {
  resultActions.insertBefore(likeButton, nextButton || null);
}

let likeTarget = null;

function latestOutcome() {
  const events = readEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.name === "game_complete" || event?.name === "game_fail") return event;
  }
  return null;
}

function readLikes() {
  const value = readJson(LIKES_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function refreshLike() {
  if (!result || result.hidden) {
    likeButton.hidden = true;
    likeTarget = null;
    return;
  }

  const outcome = latestOutcome();
  if (!outcome?.game_id) {
    likeButton.hidden = true;
    likeTarget = null;
    return;
  }

  likeTarget = { gameId: outcome.game_id, variantId: outcome.variant_id || null };
  const liked = Boolean(readLikes()[outcome.game_id]);
  likeButton.hidden = false;
  likeButton.classList.toggle("is-liked", liked);
  likeButton.textContent = liked ? "♥ Liked" : "♡ Like";
  likeButton.setAttribute("aria-pressed", String(liked));
}

likeButton.addEventListener("click", () => {
  if (!likeTarget) return;
  const likes = readLikes();
  const liked = !Boolean(likes[likeTarget.gameId]);
  if (liked) likes[likeTarget.gameId] = true;
  else delete likes[likeTarget.gameId];
  writeJson(LIKES_KEY, likes);
  likeButton.classList.toggle("is-liked", liked);
  likeButton.textContent = liked ? "♥ Liked" : "♡ Like";
  likeButton.setAttribute("aria-pressed", String(liked));
  appendEvent("game_like_changed", {
    game_id: likeTarget.gameId,
    variant_id: likeTarget.variantId,
    liked,
  });
  if (liked) navigator.vibrate?.(8);
});

if (result) {
  const resultObserver = new MutationObserver(refreshLike);
  resultObserver.observe(result, { attributes: true, attributeFilter: ["hidden"] });
}

// Start at the end so historical records do not replay as toast spam on load.
let eventCursor = readEvents().length;

function processNewEvents() {
  const events = readEvents();
  if (events.length < eventCursor) eventCursor = 0;
  const newEvents = events.slice(eventCursor);
  eventCursor = events.length;

  for (const event of newEvents) {
    if (event?.source === "round3_ui") continue;

    if (event?.name === "difficulty_changed" && Number(event.to) > Number(event.from)) {
      enqueueReward({
        type: "level_up",
        title: "LEVEL UP",
        detail: `LV ${event.to} unlocked · next set`,
        value: event.to,
      });
      continue;
    }

    if (event?.name === "personal_record_broken") {
      enqueueReward({
        type: "personal_record",
        title: "NEW RECORD",
        detail: `${recordLabel(event.record_type)} · ${recordValue(event.record_type, event.value)}`,
        value: event.value,
      });
      continue;
    }

    if (event?.name === "game_reward_granted") {
      const streak = Number(event.streak || 0);
      if (streak === 3 || streak === 5 || (streak >= 10 && streak % 5 === 0)) {
        enqueueReward({
          type: "streak_milestone",
          title: "STREAK",
          detail: `🔥 ${streak} wins in a row`,
          value: streak,
          duration: 1150,
        });
      }
    }
  }

  refreshLike();
}

setInterval(processNewEvents, 120);
refreshLike();

// Keep the normal post-game actions readable after adding Like.
if (retryButton) retryButton.setAttribute("aria-label", "Retry this game");
