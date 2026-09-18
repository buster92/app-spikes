import test from "node:test";
import assert from "node:assert/strict";
import { isActiveMountedPlay, mountFailureReason, socialEventProperties, socialPresentation } from "../src/social/play-lifecycle.js";

test("social play telemetry is attributable without activating an experiment", () => {
  assert.equal(socialPresentation("anonymous"), "anonymous");
  assert.equal(socialPresentation("unexpected"), "creator");
  assert.deepEqual(socialEventProperties("anonymous", { post_id: "post_1" }), { post_id: "post_1", presentation: "anonymous" });
});

test("stale or unresolved mounts cannot qualify as started", () => {
  const play = {}; const replacement = {};
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
