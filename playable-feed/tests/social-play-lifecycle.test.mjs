import test from "node:test";
import assert from "node:assert/strict";
import { isActiveMountedPlay, isActivePlayRequest, mountFailureReason, runtimeCallbackDisposition, socialEventProperties, socialPresentation } from "../src/social/play-lifecycle.js";

test("social play telemetry is attributable without activating an experiment", () => {
  assert.equal(socialPresentation("anonymous"), "anonymous");
  assert.equal(socialPresentation("unexpected"), "creator");
  assert.deepEqual(socialEventProperties("anonymous", { post_id: "post_1" }), { post_id: "post_1", presentation: "anonymous" });
});

test("superseded play requests cannot qualify as starts or failures", () => {
  const play = {}; const replacement = {};
  assert.equal(isActivePlayRequest({ activePlay: play, play }), true);
  assert.equal(isActivePlayRequest({ activePlay: replacement, play }), false);
  assert.equal(isActivePlayRequest({ activePlay: null, play }), false);
  assert.equal(isActiveMountedPlay({ activePlay: play, play, controller: { destroy() {} } }), true);
  assert.equal(isActiveMountedPlay({ activePlay: replacement, play, controller: { destroy() {} } }), false);
  assert.equal(isActiveMountedPlay({ activePlay: play, play, controller: null }), false);
});

test("mount failures use bounded reasons", () => {
  assert.equal(mountFailureReason({ code: "unavailable_playable" }), "unavailable_playable");
  assert.equal(mountFailureReason({ code: "playable_mismatch" }), "playable_mismatch");
  assert.equal(mountFailureReason({ code: "unsupported_runtime" }), "unsupported_runtime");
  assert.equal(mountFailureReason(new Error("canvas")), "mount_failed");
});


test("runtime callbacks buffer before start and never turn runtime faults into normal results", () => {
  const play = {};
  assert.equal(runtimeCallbackDisposition({ activePlay: play, play, runtimeStarted: false, kind: "finish" }), "buffer");
  assert.equal(runtimeCallbackDisposition({ activePlay: play, play, runtimeStarted: false, kind: "error" }), "buffer");
  assert.equal(runtimeCallbackDisposition({ activePlay: play, play, runtimeStarted: true, kind: "error" }), "handle");
  assert.equal(runtimeCallbackDisposition({ activePlay: play, play, runtimeStarted: true, runtimeFailureLogged: true, kind: "finish" }), "ignore");
  assert.equal(runtimeCallbackDisposition({ activePlay: {}, play, runtimeStarted: true, kind: "finish" }), "ignore");
});
