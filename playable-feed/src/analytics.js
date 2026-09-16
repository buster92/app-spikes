const EVENTS_KEY = "playloop.events.v1";
const USER_KEY = "playloop.anon.v1";
const RECORDS_KEY = "playloop.records.v1";
const MAX_EVENTS = 2500;

function id(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export class Analytics {
  constructor() {
    this.anonId = readJson(USER_KEY, null) || id("anon");
    safeWrite(USER_KEY, this.anonId);
    this.sessionId = id("session");
    this.sessionStartedAt = Date.now();
    this.sessionPerfStart = performance.now();
    this.sequence = 0;
    this.events = readJson(EVENTS_KEY, []);
    if (!Array.isArray(this.events)) this.events = [];
    this.log("session_start", {
      referrer: document.referrer || null,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      user_agent_family: navigator.userAgentData?.mobile ? "mobile" : "unknown",
    });
  }

  syncFromStorage() {
    const stored = readJson(EVENTS_KEY, []);
    if (!Array.isArray(stored)) return;

    // Runtime error capture and local-progression helpers can write directly to
    // the shared bounded event log. Re-sync before every analytics operation so
    // a later normal event never overwrites those externally captured records.
    const byId = new Map();
    for (const event of [...this.events, ...stored]) {
      const key = event?.event_id || `${event?.name}:${event?.ts}:${byId.size}`;
      byId.set(key, event);
    }
    this.events = [...byId.values()].slice(-MAX_EVENTS);
  }

  log(name, properties = {}) {
    this.syncFromStorage();
    const event = {
      schema: 1,
      name,
      event_id: id("evt"),
      anon_id: this.anonId,
      session_id: this.sessionId,
      sequence: this.sequence++,
      ts: new Date().toISOString(),
      session_ms: Math.round(performance.now() - this.sessionPerfStart),
      ...properties,
    };

    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(this.events.length - MAX_EVENTS);
    }
    safeWrite(EVENTS_KEY, this.events);

    if (location.search.includes("debug=1")) {
      console.debug("[playloop]", name, event);
    }
    return event;
  }

  recent(limit = 100) {
    this.syncFromStorage();
    return this.events.slice(-limit);
  }

  currentSessionEvents() {
    this.syncFromStorage();
    return this.events.filter((event) => event.session_id === this.sessionId);
  }

  summary() {
    const events = this.currentSessionEvents();
    const count = (name) => events.filter((event) => event.name === name).length;
    const activeDurations = events
      .filter((event) => ["game_complete", "game_fail", "game_skip"].includes(event.name))
      .map((event) => Number(event.active_ms || 0))
      .filter((value) => Number.isFinite(value) && value >= 0);

    return {
      gamesSeen: count("game_impression"),
      gamesStarted: count("game_first_interaction"),
      completed: count("game_complete"),
      failed: count("game_fail"),
      skipped: count("game_skip"),
      retries: count("game_retry"),
      swipes: count("feed_swipe"),
      averageActiveMs: activeDurations.length
        ? Math.round(activeDurations.reduce((sum, value) => sum + value, 0) / activeDurations.length)
        : 0,
      sessionMs: Date.now() - this.sessionStartedAt,
    };
  }

  exportPayload() {
    this.syncFromStorage();
    return {
      exported_at: new Date().toISOString(),
      schema: 1,
      product: "playable-feed-spike",
      summary: this.summary(),
      personal_records: readJson(RECORDS_KEY, null),
      events: this.events,
    };
  }

  exportJson() {
    const blob = new Blob([JSON.stringify(this.exportPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `playloop-events-${new Date().toISOString().replaceAll(":", "-")}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  clearStoredEvents() {
    this.events = [];
    safeWrite(EVENTS_KEY, this.events);
    this.log("analytics_cleared");
  }
}
