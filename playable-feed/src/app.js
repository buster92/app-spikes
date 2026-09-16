import { Analytics } from "./analytics.js";
import { GAME_DEFINITIONS } from "./games.js";
import { buildDeck, nextDifficulty } from "./feed.js";

const analytics = new Analytics();
const els = {
  shell: document.querySelector("#appShell"),
  stage: document.querySelector("#feedStage"),
  card: document.querySelector("#gameCard"),
  host: document.querySelector("#gameHost"),
  title: document.querySelector("#gameTitle"),
  category: document.querySelector("#gameCategory"),
  instruction: document.querySelector("#gameInstruction"),
  progress: document.querySelector("#feedProgress"),
  cycle: document.querySelector("#cycleLabel"),
  difficulty: document.querySelector("#difficultyLabel"),
  xp: document.querySelector("#xpLabel"),
  streak: document.querySelector("#streakLabel"),
  result: document.querySelector("#resultOverlay"),
  resultWord: document.querySelector("#resultWord"),
  resultDetail: document.querySelector("#resultDetail"),
  resultScore: document.querySelector("#resultScore"),
  retry: document.querySelector("#retryButton"),
  next: document.querySelector("#nextButton"),
  statsButton: document.querySelector("#statsButton"),
  statsSheet: document.querySelector("#statsSheet"),
  statsBackdrop: document.querySelector("#statsBackdrop"),
  statsBody: document.querySelector("#statsBody"),
  closeStats: document.querySelector("#closeStats"),
  exportButton: document.querySelector("#exportButton"),
  clearButton: document.querySelector("#clearButton"),
  onboarding: document.querySelector("#onboarding"),
  startButton: document.querySelector("#startButton"),
};

const sessionSeed = `${analytics.sessionId}:${Date.now()}`;
const state = {
  cycle: 0,
  index: 0,
  deck: [],
  current: null,
  controller: null,
  shownAt: 0,
  activeAccumulatedMs: 0,
  firstInteractionAt: null,
  finished: false,
  started: false,
  pausedForVisibility: false,
  xp: Number(sessionStorage.getItem("playloop.xp") || 0),
  streak: Number(sessionStorage.getItem("playloop.streak") || 0),
  difficulty: Number(sessionStorage.getItem("playloop.difficulty") || 1),
  outcomes: [],
  transitioning: false,
  impressions: 0,
};

let audioContext = null;
function tone(frequency = 520, duration = 0.05) {
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Sound is optional and should never block play.
  }
}

function haptic(pattern = 8) {
  navigator.vibrate?.(pattern);
}

function buildCurrentDeck() {
  state.deck = buildDeck(GAME_DEFINITIONS, {
    cycle: state.cycle,
    sessionSeed,
    difficulty: state.difficulty,
  });
  state.index = 0;
}

function applyTheme(config) {
  const { accent, accent2, background } = config.variant;
  els.shell.style.setProperty("--game-accent", accent);
  els.shell.style.setProperty("--game-accent-2", accent2);
  els.shell.style.setProperty("--game-bg", background);
}

function updateHud() {
  const deckLength = state.deck.length || GAME_DEFINITIONS.length;
  els.progress.textContent = `${state.index + 1}/${deckLength}`;
  els.cycle.textContent = `SET ${state.cycle + 1}`;
  els.difficulty.textContent = `LV ${state.current?.difficulty ?? state.difficulty}`;
  els.xp.textContent = `${state.xp} XP`;
  els.streak.textContent = state.streak > 1 ? `🔥 ${state.streak}` : "";
}

function activeMs() {
  const currentSlice = state.shownAt ? performance.now() - state.shownAt : 0;
  return Math.max(0, Math.round(state.activeAccumulatedMs + currentSlice));
}

function freezeActiveClock() {
  if (!state.shownAt) return;
  state.activeAccumulatedMs += Math.max(0, performance.now() - state.shownAt);
  state.shownAt = 0;
}

function logReachMilestone() {
  const milestones = new Set([3, 5, 10, 20, 50, 100]);
  if (milestones.has(state.impressions)) {
    analytics.log("feed_reach_milestone", {
      games_seen: state.impressions,
      cycle: state.cycle,
      difficulty: state.difficulty,
    });
  }
}

function mountCurrent({ retry = false, resumed = false } = {}) {
  if (!state.started || !state.deck.length) return;

  state.controller?.destroy?.();
  els.host.replaceChildren();
  els.result.hidden = true;
  els.card.classList.remove("card-out", "card-in", "success-pulse", "fail-shake");

  state.current = state.deck[state.index];
  state.finished = false;
  state.pausedForVisibility = false;
  if (!resumed) {
    state.firstInteractionAt = null;
    state.activeAccumulatedMs = 0;
  }
  state.shownAt = performance.now();

  const game = state.current;
  applyTheme(game);
  updateHud();
  els.title.textContent = game.title;
  els.category.textContent = game.category.toUpperCase();
  els.instruction.textContent = game.instruction;

  // A retry is another attempt at the same feed item, not another item seen.
  // Likewise, a background/foreground lifecycle restart must not inflate reach.
  if (!retry && !resumed) {
    state.impressions += 1;
    analytics.log("game_impression", {
      game_id: game.id,
      variant_id: game.variantId,
      feed_position: state.cycle * state.deck.length + state.index,
      session_impression: state.impressions,
      position_in_cycle: state.index,
      cycle: state.cycle,
      difficulty: game.difficulty,
    });
    logReachMilestone();
  } else if (resumed) {
    analytics.log("game_resumed_after_background", {
      game_id: game.id,
      variant_id: game.variantId,
      active_ms_before_resume: Math.round(state.activeAccumulatedMs),
      feed_position: state.cycle * state.deck.length + state.index,
    });
  }

  const interact = (type, data = {}) => {
    if (state.finished || state.pausedForVisibility) return;
    if (state.firstInteractionAt === null) {
      state.firstInteractionAt = performance.now();
      analytics.log("game_first_interaction", {
        game_id: game.id,
        variant_id: game.variantId,
        time_to_first_interaction_ms: Math.round(state.firstInteractionAt - state.shownAt),
      });
    }
    analytics.log("game_interaction", {
      game_id: game.id,
      variant_id: game.variantId,
      interaction_type: type,
      ...data,
    });
  };

  state.controller = game.mount(els.host, game, {
    interact,
    haptic,
    tone,
    complete: (result) => finishGame("complete", result),
    fail: (result) => finishGame("fail", result),
  });

  requestAnimationFrame(() => els.card.classList.add("card-in"));
}

function finishGame(outcome, result = {}) {
  if (!state.started || state.finished || state.pausedForVisibility || !state.current) return;
  freezeActiveClock();
  state.finished = true;
  state.controller?.destroy?.();

  const game = state.current;
  const ms = activeMs();
  const score = Math.max(0, Math.round(Number(result.score || 0)));
  analytics.log(outcome === "complete" ? "game_complete" : "game_fail", {
    game_id: game.id,
    variant_id: game.variantId,
    active_ms: ms,
    score,
    detail: result.detail || null,
    difficulty: game.difficulty,
  });

  state.outcomes.push(outcome);
  if (state.outcomes.length > 8) state.outcomes.shift();

  if (outcome === "complete") {
    state.streak += 1;
    const gain = Math.max(25, Math.round(score / 10));
    state.xp += gain;
    els.resultWord.textContent = state.streak >= 3 ? "ON FIRE" : "NICE";
    els.resultScore.textContent = `+${gain} XP`;
    els.card.classList.add("success-pulse");
    tone(820, 0.09);
  } else {
    state.streak = 0;
    els.resultWord.textContent = "SO CLOSE";
    els.resultScore.textContent = score ? `${score} pts` : "TRY AGAIN";
    els.card.classList.add("fail-shake");
  }

  els.resultDetail.textContent = result.detail || (outcome === "complete" ? "Clean run" : "One more try?");
  els.result.hidden = false;
  sessionStorage.setItem("playloop.xp", String(state.xp));
  sessionStorage.setItem("playloop.streak", String(state.streak));

  const previousDifficulty = state.difficulty;
  state.difficulty = nextDifficulty(state.difficulty, state.outcomes);
  if (state.difficulty !== previousDifficulty) {
    analytics.log("difficulty_changed", {
      from: previousDifficulty,
      to: state.difficulty,
      reason: state.outcomes.slice(-3),
      applies_from_next_cycle: true,
    });
    sessionStorage.setItem("playloop.difficulty", String(state.difficulty));
  }
  updateHud();
}

function skipCurrent(reason = "swipe") {
  if (!state.started || !state.current || state.transitioning || state.pausedForVisibility) return;
  if (!state.finished) {
    freezeActiveClock();
    analytics.log("game_skip", {
      game_id: state.current.id,
      variant_id: state.current.variantId,
      active_ms: activeMs(),
      had_interaction: state.firstInteractionAt !== null,
      reason,
    });
    state.outcomes.push("skip");
    if (state.outcomes.length > 8) state.outcomes.shift();
  }
  advance(reason);
}

function advance(reason = "swipe") {
  if (!state.started || !state.current || state.transitioning || state.pausedForVisibility) return;
  state.transitioning = true;
  analytics.log("feed_advance", {
    from_game_id: state.current.id,
    from_variant_id: state.current.variantId,
    reason,
    feed_position: state.cycle * state.deck.length + state.index,
  });

  state.controller?.destroy?.();
  els.card.classList.remove("card-in");
  els.card.classList.add("card-out");

  setTimeout(() => {
    state.index += 1;
    if (state.index >= state.deck.length) {
      const completedCycle = state.cycle;
      state.cycle += 1;
      buildCurrentDeck();
      analytics.log("feed_cycle_completed", {
        completed_cycle: completedCycle,
        next_cycle: state.cycle,
        next_cycle_difficulty: state.difficulty,
      });
    }
    mountCurrent();
    state.transitioning = false;
  }, 180);
}

function retry() {
  if (!state.started || !state.current || state.transitioning || !state.finished) return;
  analytics.log("game_retry", {
    game_id: state.current.id,
    variant_id: state.current.variantId,
    active_ms_before_retry: activeMs(),
  });
  mountCurrent({ retry: true });
}

function renderStats() {
  const summary = analytics.summary();
  const values = [
    ["Seen", summary.gamesSeen],
    ["Started", summary.gamesStarted],
    ["Completed", summary.completed],
    ["Failed", summary.failed],
    ["Skipped", summary.skipped],
    ["Retries", summary.retries],
    ["Avg active", `${(summary.averageActiveMs / 1000).toFixed(1)}s`],
    ["Session", `${Math.round(summary.sessionMs / 1000)}s`],
  ];
  els.statsBody.innerHTML = values
    .map(([label, value]) => `<div class="stat-cell"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function openStats() {
  renderStats();
  els.statsSheet.hidden = false;
  els.statsBackdrop.hidden = false;
  analytics.log("analytics_opened");
}

function closeStats() {
  els.statsSheet.hidden = true;
  els.statsBackdrop.hidden = true;
}

let pointerStart = null;
els.stage.addEventListener("pointerdown", (event) => {
  if (!state.started || state.pausedForVisibility) return;
  pointerStart = { x: event.clientX, y: event.clientY, at: performance.now() };
});

// Capture pointer-up before game controls receive it. This reserves an upward
// gesture for feed navigation so Swipe Call / Hold Steady cannot first record a
// failure for the same gesture and corrupt skip/failure analytics.
els.stage.addEventListener("pointerup", (event) => {
  if (!pointerStart || state.transitioning || !state.started || state.pausedForVisibility) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  const elapsed = performance.now() - pointerStart.at;
  pointerStart = null;

  const isUp = dy < -72 && Math.abs(dy) > Math.abs(dx) * 1.15 && elapsed < 850;
  if (!isUp) return;

  event.preventDefault();
  event.stopPropagation();
  analytics.log("feed_swipe", {
    direction: "up",
    dy: Math.round(dy),
    duration_ms: Math.round(elapsed),
    game_id: state.current?.id || null,
    game_state: state.finished ? "finished" : "active",
  });
  haptic(5);
  skipCurrent("swipe_up");
}, { capture: true });

els.stage.addEventListener("pointercancel", () => {
  pointerStart = null;
}, { capture: true });

els.retry.addEventListener("click", retry);
els.next.addEventListener("click", () => advance("next_button"));
els.statsButton.addEventListener("click", openStats);
els.closeStats.addEventListener("click", closeStats);
els.statsBackdrop.addEventListener("click", closeStats);
els.exportButton.addEventListener("click", () => {
  analytics.log("analytics_exported");
  analytics.exportJson();
});
els.clearButton.addEventListener("click", () => {
  if (!confirm("Clear locally stored playtest events?")) return;
  analytics.clearStoredEvents();
  renderStats();
});

els.startButton.addEventListener("click", () => {
  if (state.started) return;
  state.started = true;
  els.onboarding.hidden = true;
  audioContext?.resume?.();
  analytics.log("onboarding_completed");
  analytics.log("feed_started", { game_count: GAME_DEFINITIONS.length, difficulty: state.difficulty });
  haptic(6);
  mountCurrent();
});

window.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pointerStart = null;
    if (state.started && state.current && !state.finished && !state.pausedForVisibility) {
      freezeActiveClock();
      state.pausedForVisibility = true;
      state.controller?.destroy?.();
      analytics.log("game_paused_background", {
        game_id: state.current.id,
        variant_id: state.current.variantId,
        active_ms: activeMs(),
      });
    }
    analytics.log("app_hidden", {
      started: state.started,
      game_id: state.current?.id || null,
      game_state: state.current ? (state.finished ? "finished" : "active") : "not_started",
    });
    return;
  }

  analytics.log("app_visible", {
    started: state.started,
    game_id: state.current?.id || null,
    game_state: state.current ? (state.finished ? "finished" : "active") : "not_started",
  });

  if (state.pausedForVisibility && state.started && state.current && !state.finished) {
    // Restart the same deterministic variant after backgrounding. The feed item
    // is not counted again, and active-time accounting excludes hidden time.
    mountCurrent({ resumed: true });
  }
});

window.addEventListener("pagehide", () => {
  freezeActiveClock();
  analytics.log("session_end", {
    ...analytics.summary(),
    xp: state.xp,
    streak: state.streak,
    difficulty: state.difficulty,
    started: state.started,
  });
});

window.addEventListener("keydown", (event) => {
  if (!state.started || state.pausedForVisibility) return;
  if (event.key === "ArrowUp" || event.key === "PageDown") skipCurrent("keyboard");
  if (event.key.toLowerCase() === "r" && state.finished) retry();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

buildCurrentDeck();
updateHud();
analytics.log("app_ready", { game_count: GAME_DEFINITIONS.length, difficulty: state.difficulty });
