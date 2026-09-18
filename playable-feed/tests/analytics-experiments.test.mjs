import test from "node:test";
import assert from "node:assert/strict";
import { Analytics, logProductEvent } from "../src/analytics.js";

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

function installBrowserGlobals({ search = "", storage = new MemoryStorage() } = {}) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", {
    value: { referrer: "" },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { innerWidth: 390, innerHeight: 844 },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgentData: { mobile: true } },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "location", {
    value: { search },
    configurable: true,
    writable: true,
  });
  return storage;
}

test("malformed stored anonymous identity is replaced instead of breaking startup", () => {
  const storage = installBrowserGlobals({
    storage: new MemoryStorage({
      "playloop.anon.v1": JSON.stringify({ unexpected: "object" }),
    }),
  });

  const analytics = new Analytics();

  assert.equal(typeof analytics.anonId, "string");
  assert.match(analytics.anonId, /^anon_/);
  assert.equal(JSON.parse(storage.getItem("playloop.anon.v1")), analytics.anonId);
  assert.equal(analytics.currentSessionEvents()[0].name, "session_start");
});

test("analytics preserves forced exposure attribution and adds context only afterward", () => {
  const storage = installBrowserGlobals({
    search: "?exp=onboarding_value_prop_v1:instant_play",
    storage: new MemoryStorage({
      "playloop.anon.v1": JSON.stringify("anon_fixed"),
    }),
  });

  const analytics = new Analytics();
  const variant = analytics.experimentVariant("onboarding_value_prop_v1", {
    surface: "onboarding",
    forced: false,
    variant_id: "control",
    event_id: "bad_event",
  });

  assert.equal(variant, "instant_play");

  const exposure = analytics.currentSessionEvents().find((event) => event.name === "experiment_exposure");
  assert.ok(exposure);
  assert.equal(exposure.experiment_id, "onboarding_value_prop_v1");
  assert.equal(exposure.variant_id, "instant_play");
  assert.equal(exposure.forced, true);
  assert.equal(exposure.surface, "onboarding");
  assert.equal(exposure.experiment_context, undefined);
  assert.notEqual(exposure.event_id, "bad_event");

  const downstream = analytics.log("probe");
  assert.deepEqual(downstream.experiment_context, {
    onboarding_value_prop_v1: "instant_play",
  });
  assert.ok(storage.getItem("playloop.events.v1"));
});


test("active exposure survives rolling-buffer truncation", () => {
  installBrowserGlobals({
    search: "?exp=onboarding_value_prop_v1:instant_play",
    storage: new MemoryStorage({
      "playloop.anon.v1": JSON.stringify("anon_rollover"),
    }),
  });

  const analytics = new Analytics();
  analytics.experimentVariant("onboarding_value_prop_v1", { surface: "onboarding" });
  const exposure = analytics.currentSessionEvents().find((event) => event.name === "experiment_exposure");
  assert.ok(exposure);

  const ordinary = Array.from({ length: 2500 }, (_, index) => ({
    schema: 1,
    name: "synthetic",
    event_id: `evt_synthetic_${index}`,
    session_id: analytics.sessionId,
    ts: new Date(index).toISOString(),
  }));
  analytics.events = [exposure, ...ordinary];
  localStorage.setItem("playloop.events.v1", JSON.stringify(analytics.events));

  const tail = analytics.log("tail");
  const persisted = JSON.parse(localStorage.getItem("playloop.events.v1"));

  assert.equal(persisted.length, 2500);
  assert.ok(persisted.some((event) => event.event_id === exposure.event_id));
  assert.ok(persisted.some((event) => event.event_id === tail.event_id));
  assert.equal(
    persisted.filter((event) => event.name === "experiment_exposure" && event.experiment_id === "onboarding_value_prop_v1").length,
    1,
  );
});

test("clearing events preserves the active exposure denominator", () => {
  installBrowserGlobals({
    search: "?exp=onboarding_value_prop_v1:instant_play",
    storage: new MemoryStorage({
      "playloop.anon.v1": JSON.stringify("anon_clear"),
    }),
  });

  const analytics = new Analytics();
  analytics.experimentVariant("onboarding_value_prop_v1", { surface: "onboarding" });
  analytics.log("before_clear");
  analytics.clearStoredEvents();

  const events = analytics.currentSessionEvents();
  const exposures = events.filter((event) => event.name === "experiment_exposure");
  const cleared = events.find((event) => event.name === "analytics_cleared");

  assert.equal(exposures.length, 1);
  assert.equal(exposures[0].forced, true);
  assert.equal(events.some((event) => event.name === "before_clear"), false);
  assert.ok(cleared);
  assert.deepEqual(cleared.experiment_context, {
    onboarding_value_prop_v1: "instant_play",
  });

  analytics.experimentVariant("onboarding_value_prop_v1");
  assert.equal(
    analytics.currentSessionEvents().filter((event) => event.name === "experiment_exposure").length,
    1,
  );
});

test("secondary product writers inherit active experiment context", () => {
  installBrowserGlobals({
    search: "?exp=onboarding_value_prop_v1:instant_play",
    storage: new MemoryStorage({
      "playloop.anon.v1": JSON.stringify("anon_secondary"),
    }),
  });

  const analytics = new Analytics();
  analytics.experimentVariant("onboarding_value_prop_v1", { surface: "onboarding" });

  const event = logProductEvent("game_like_changed", {
    game_id: "tap_rush",
    liked: true,
  });

  assert.ok(event);
  assert.equal(event.session_id, analytics.sessionId);
  assert.deepEqual(event.experiment_context, {
    onboarding_value_prop_v1: "instant_play",
  });
});
