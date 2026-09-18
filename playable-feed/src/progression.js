import { logProductEvent } from "./analytics.js";

const RECORDS_KEY = "playloop.records.v1";
const EVENTS_KEY = "playloop.events.v1";

const defaults = {
  bestXp: 0,
  bestStreak: 0,
  bestDifficulty: 1,
  longestRun: 0,
};

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
  const events = readJson(EVENTS_KEY, []);
  return Array.isArray(events) ? events : [];
}

function latestSessionId(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.name === "session_start" && events[index]?.session_id) return events[index].session_id;
  }
  return null;
}

function deriveHistoricalRecords(events) {
  const impressionsBySession = new Map();
  let bestXp = 0;
  let bestStreak = 0;
  let bestDifficulty = 1;

  for (const event of events) {
    if (event?.name === "game_impression" && event.session_id) {
      impressionsBySession.set(event.session_id, (impressionsBySession.get(event.session_id) || 0) + 1);
      bestDifficulty = Math.max(bestDifficulty, Number(event.difficulty || 1));
    }
    if (event?.name === "session_end") {
      bestXp = Math.max(bestXp, Number(event.xp || 0));
      bestStreak = Math.max(bestStreak, Number(event.streak || 0));
      bestDifficulty = Math.max(bestDifficulty, Number(event.difficulty || 1));
    }
  }

  return {
    bestXp,
    bestStreak,
    bestDifficulty,
    longestRun: Math.max(0, ...impressionsBySession.values()),
  };
}

function numberFromText(element, fallback = 0) {
  const match = element?.textContent?.match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

const els = {
  xp: document.querySelector("#xpLabel"),
  streak: document.querySelector("#streakLabel"),
  difficulty: document.querySelector("#difficultyLabel"),
  title: document.querySelector("#gameTitle"),
  recordsBody: document.querySelector("#recordsBody"),
  recordToast: document.querySelector("#recordToast"),
  statsButton: document.querySelector("#statsButton"),
};

const eventsAtLoad = readEvents();
const historical = deriveHistoricalRecords(eventsAtLoad);
const stored = readJson(RECORDS_KEY, {});
let records = {
  bestXp: Math.max(defaults.bestXp, historical.bestXp, Number(stored.bestXp || 0)),
  bestStreak: Math.max(defaults.bestStreak, historical.bestStreak, Number(stored.bestStreak || 0)),
  bestDifficulty: Math.max(defaults.bestDifficulty, historical.bestDifficulty, Number(stored.bestDifficulty || 1)),
  longestRun: Math.max(defaults.longestRun, historical.longestRun, Number(stored.longestRun || 0)),
};

const baseline = { ...records };
const celebrated = new Set();
let toastTimer = null;

function currentValues() {
  const events = readEvents();
  const sessionId = latestSessionId(events);
  const gamesSeen = sessionId
    ? events.filter((event) => event?.session_id === sessionId && event?.name === "game_impression").length
    : 0;

  return {
    bestXp: numberFromText(els.xp, 0),
    bestStreak: numberFromText(els.streak, 0),
    bestDifficulty: numberFromText(els.difficulty, 1),
    longestRun: gamesSeen,
  };
}

const labels = {
  bestXp: "XP",
  bestStreak: "STREAK",
  bestDifficulty: "LEVEL",
  longestRun: "RUN",
};

function appendRecordEvent(type, previous, value) {
  try {
    logProductEvent("personal_record_broken", {
      record_type: type,
      previous,
      value,
      source: "local_progression",
    });
  } catch {
    // Progression reinforcement must never interrupt play.
  }
}

function showToast(type, value) {
  if (!els.recordToast) return;
  els.recordToast.textContent = `NEW BEST · ${labels[type]} ${value}`;
  els.recordToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.recordToast.hidden = true;
  }, 1500);
}

function renderRecords() {
  if (!els.recordsBody) return;
  const values = [
    ["Best XP", records.bestXp],
    ["Best streak", `🔥 ${records.bestStreak}`],
    ["Highest level", `LV ${records.bestDifficulty}`],
    ["Longest run", `${records.longestRun} games`],
  ];
  els.recordsBody.innerHTML = values
    .map(([label, value]) => `<div class="record-cell"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function updateRecords({ announce = true } = {}) {
  const values = currentValues();
  let changed = false;

  for (const type of Object.keys(records)) {
    const value = Number(values[type] || 0);
    if (value <= records[type]) continue;
    const previous = records[type];
    records[type] = value;
    changed = true;

    if (announce && value > baseline[type] && !celebrated.has(type)) {
      celebrated.add(type);
      appendRecordEvent(type, Math.max(previous, baseline[type]), value);
      showToast(type, value);
    }
  }

  if (changed) writeJson(RECORDS_KEY, records);
  renderRecords();
}

// Adopt the current in-progress run as the baseline when this feature first lands.
// Celebration starts only when the player beats that baseline afterwards.
updateRecords({ announce: false });
Object.assign(baseline, records);

const observer = new MutationObserver(() => updateRecords());
for (const element of [els.xp, els.streak, els.difficulty, els.title]) {
  if (element) observer.observe(element, { childList: true, characterData: true, subtree: true });
}

els.statsButton?.addEventListener("click", () => updateRecords({ announce: false }));
