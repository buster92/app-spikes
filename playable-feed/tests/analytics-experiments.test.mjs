import test from "node:test";
import assert from "node:assert/strict";
import { Analytics } from "../src/analytics.js";

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
