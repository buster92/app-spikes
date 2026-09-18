import test from "node:test";
import assert from "node:assert/strict";
import { QualifiedImpressionTracker, shouldObservePostImpressions } from "../src/social/impressions.js";

function harness() {
  const callbacks = new Map(); let id = 0; const events = [];
  const tracker = new QualifiedImpressionTracker({ onImpression: (event) => events.push(event), schedule: (callback) => { callbacks.set(++id, callback); return id; }, cancel: (token) => callbacks.delete(token) });
  return { tracker, events, flush: () => { for (const callback of [...callbacks.values()]) callback(); callbacks.clear(); } };
}

const exposure = { postId: "post_1", ratio: 0.5, metadata: { post_id: "post_1", game_id: "game_1", presentation: "creator", surface: "discover" } };

test("below-threshold cards do not log impressions", () => {
  const { tracker, events, flush } = harness(); tracker.update({ ...exposure, ratio: 0.49 }); flush(); assert.equal(events.length, 0);
});

test("qualified dwell logs once with presentation and surface metadata", () => {
  const { tracker, events, flush } = harness(); tracker.update(exposure); flush(); tracker.update(exposure); flush();
  assert.deepEqual(events, [exposure.metadata]);
});

test("visibility loss and rerender cancel dwell without duplicating prior impressions", () => {
  const { tracker, events, flush } = harness(); tracker.update(exposure); tracker.resetVisible(); flush(); assert.equal(events.length, 0);
  tracker.update(exposure); flush(); tracker.resetVisible(); tracker.update(exposure); flush(); assert.equal(events.length, 1);
});

test("backgrounding cancels dwell and requires a fresh visible interval", () => {
  const { tracker, events, flush } = harness();
  tracker.update(exposure);
  tracker.setDocumentVisible(false);
  flush();
  assert.equal(events.length, 0);
  tracker.update(exposure);
  flush();
  assert.equal(events.length, 0);
  tracker.setDocumentVisible(true);
  tracker.update(exposure);
  flush();
  assert.deepEqual(events, [exposure.metadata]);
});

test("play and outcome modals suspend impressions, cancel dwell, and require a fresh interval", () => {
  const { tracker, events, flush } = harness();
  assert.equal(shouldObservePostImpressions({ hasPlayModal: true }), false);
  assert.equal(shouldObservePostImpressions({ hasOutcomeModal: true }), false);
  assert.equal(shouldObservePostImpressions(), true);
  tracker.update(exposure);
  // render() disconnects the observer and calls this when either modal opens.
  tracker.resetVisible();
  flush();
  assert.equal(events.length, 0);
  tracker.update(exposure);
  flush();
  assert.deepEqual(events, [exposure.metadata]);
});
