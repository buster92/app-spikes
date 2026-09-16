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
  firstInteractionAt: null,
  finished: false,
  started: false,
  xp: Number(sessionStorage.getItem("playloop.xp") || 0),
  streak: Number(sessionStorage.getItem("playloop.streak") || 0),
  difficulty: Number(sessionStorage.getItem("playloop.difficulty") || 1),
  outcomes: [],
  transitioning: false,
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
    // Sound is optional.
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
  els.progress.textContent = `${state.index + 1}/${state.deck.length}`;
  els.cycle.textContent = `SET ${state.cycle + 1}`;
  els.difficulty.textContent = `LV ${state.difficulty}`;
  els.xp.textContent = `${state.xp} XP`;
  els.streak.textContent = state.streak > 1 ? `🔥 ${state.streak}` : "";
}

function activeMs() {
  return Math.max(0, Math.round(performance.now() - state.shownAt));
}

function mountCurrent({ retry = false } = {}) {
  state.controller?.destroy?.();
  els.host.replaceChildren();
  els.result.hidden = true;
  els.card.classList.remove("card-out", "card-in", "success-pulse", "fail-shake");

  state.current = state.deck[state.index];
  state.finished = false;
  state.firstInteractionAt = null;
  state.shownAt = performance.now();

  const game = state.current;
  applyTheme(game);
  updateHud();
  els.title.textContent = game.title;
  els.category.textContent = game.category.toUpperCase();
  els.instruction.textContent = game.instruction;

  analytics.log("game_impression", {
    game_id: game.id,
    variant_id: game.variantId,
    feed_position: state.cycle * state.deck.length + state.index,
    position_in_cycle: state.index,
    cycle: state.cycle,
    difficulty: state.difficulty,
    retry,
  });

  const interact = (type, data = {}) => {
    if (state.finished) return;
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
  if (state.finished) return;
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
    difficulty: state.difficulty,
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
  updateHud();

  const previousDifficulty = state.difficulty;
  state.difficulty = nextDifficulty(state.difficulty, state.outcomes);
  if (state.difficulty !== previousDifficulty) {
    analytics.log("difficulty_changed", { from: previousDifficulty, to: state.difficulty, reason: state.outcomes.slice(-3) });
    sessionStorage.setItem("playloop.difficulty", String(state.difficulty));
  }
}

function skipCurrent(reason = "swipe") {
  if (!state.current || state.transitioning) return;
  if (!state.finished) {
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
  if (state.transitioning) return;
  state.transitioning = true;
  analytics.log("feed_advance", {
    from_game_id: state.current?.id || null,
    from_variant_id: state.current?.variantId || null,
    reason,
    feed_position: state.cycle * state.deck.length + state.index,
  });

  state.controller?.destroy?.();
  els.card.classList.remove("card-in");
  els.card.classList.add("card-out");

  setTimeout(() => {
    state.index += 1;
    if (state.index >= state.deck.length) {
      state.cycle += 1;
      buildCurrentDeck();
      analytics.log("feed_cycle_completed", { completed_cycle: state.cycle - 1, next_cycle: state.cycle, difficulty: state.difficulty });
    }
    mountCurrent();
    state.transitioning = false;
  }, 180);
}

function retry() {
  if (!state.current || state.transitioning) return;
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
    ["Skipped", summary.skipped],
    ["Retries", summary.retries],
    ["Avg active", `${(summary.averageActiveMs / 1000).toFixed(1)}s`],
  ];
  els.statsBody.innerHTML = values.map(([label, value]) => `<div class="stat-cell"><span>${label}</span><strong>${value}</strong></div>`).join("");
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
  pointerStart = { x: event.clientX, y: event.clientY, at: performance.now() };
});
els.stage.addEventListener("pointerup", (event) => {
  if (!pointerStart || state.transitioning || !state.started) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  const elapsed = performance.now() - pointerStart.at;
  pointerStart = null;

  const isUp = dy < -72 && Math.abs(dy) > Math.abs(dx) * 1.15 && elapsed < 850;
  if (!isUp) return;

  analytics.log("feed_swipe", {
    direction: "up",
    dy: Math.round(dy),
    duration_ms: Math.round(elapsed),
    game_id: state.current?.id || null,
    game_state: state.finished ? "finished" : "active",
  });
  haptic(5);
  skipCurrent("swipe_up");
});

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
  state.started = true;
  els.onboarding.hidden = true;
  audioContext?.resume?.();
  analytics.log("onboarding_completed");
  haptic(6);
});

window.addEventListener("visibilitychange", () => {
  analytics.log(document.hidden ? "app_hidden" : "app_visible", {
    game_id: state.current?.id || null,
    game_state: state.finished ? "finished" : "active",
  });
});
window.addEventListener("pagehide", () => {
  analytics.log("session_end", { ...analytics.summary(), xp: state.xp, streak: state.streak, difficulty: state.difficulty });
});
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "PageDown") skipCurrent("keyboard");
  if (event.key.toLowerCase() === "r" && state.finished) retry();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

buildCurrentDeck();
mountCurrent();
analytics.log("app_ready", { game_count: GAME_DEFINITIONS.length, difficulty: state.difficulty });
