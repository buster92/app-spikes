import test from "node:test";
import assert from "node:assert/strict";
import { compareResults, playableRefKey, samePlayableRef, validateChallenge, validatePlayAttempt, validatePlayableRef, validatePlayResult, validatePost, validateResultPolicy } from "../src/social/domain.js";
import { BUNDLED_PLAYABLES, playableRefFor } from "../src/social/catalog.js";

const ref = playableRefFor(BUNDLED_PLAYABLES[0]);
const result = (id, metric, status = "completed", playableRef = ref) => ({ id, actorId: `actor_${id}`, postId: "post_test", playableRef, status, metric, createdAt: "2026-09-18T00:00:00.000Z", verification: "trusted_shell_local" });

test("result policy accepts bounded trusted policies and rejects creator-defined behavior", () => {
  assert.deepEqual(validateResultPolicy({ kind: "higher_score", arbitraryCode: "return true" }), { kind: "higher_score" });
  assert.throws(() => validateResultPolicy({ kind: "custom", code: "score > 1" }), /unsupported/i);
});

test("higher score comparison chooses the larger completed metric", () => {
  assert.deepEqual(compareResults({ kind: "higher_score" }, result("one", 47), result("two", 41)), { comparable: true, outcome: "win", delta: 6, reason: "metric" });
});

test("lower time and lower moves choose the smaller metric", () => {
  assert.equal(compareResults({ kind: "lower_time" }, result("one", 5100), result("two", 6200)).outcome, "win");
  assert.equal(compareResults({ kind: "lower_moves" }, result("one", 18), result("two", 14)).outcome, "loss");
});

test("completion-first policies rank completion before scalar tie-break", () => {
  const comparison = compareResults({ kind: "completion_then_higher_score" }, result("one", 2, "completed"), result("two", 99, "failed"));
  assert.deepEqual(comparison, { comparable: true, outcome: "win", reason: "completion", delta: null });
});

test("failed scalar runs and mismatched playable revisions are incomparable", () => {
  assert.equal(compareResults({ kind: "higher_score" }, result("one", 1, "failed"), result("two", 2)).reason, "incomplete");
  const changed = { ...ref, seed: ref.seed + 1 };
  assert.equal(compareResults({ kind: "higher_score" }, result("one", 3), result("two", 2, "completed", changed)).reason, "playable_mismatch");
});

test("playable identity includes runtime, hashes, manifest version and exact seed", () => {
  assert.equal(samePlayableRef(ref, structuredClone(ref)), true);
  for (const changed of [{ ...ref, seed: 999 }, { ...ref, specRef: `sha256:${"0".repeat(64)}` }, { ...ref, runtime: "playloop-2d-v9" }]) {
    assert.notEqual(playableRefKey(ref), playableRefKey(changed));
  }
});

test("playable and post validation reject mutable or malformed authority", () => {
  assert.throws(() => validatePlayableRef({ ...ref, specRef: "latest" }), /content-addressed/i);
  assert.throws(() => validatePost({ id: "post_x", creatorId: "creator_x", createdAt: "2026-09-18T00:00:00.000Z", caption: "", playableRef: ref, resultPolicy: { kind: "higher_score" }, status: "published" }), /caption/i);
});

test("social timestamps, replay evidence and previews are bounded", () => {
  assert.throws(() => validatePost({ id: "post_x", creatorId: "creator_x", createdAt: "now", caption: "Valid", playableRef: ref, resultPolicy: { kind: "higher_score" }, status: "published" }), /ISO-8601/i);
  assert.throws(() => validatePlayResult({ ...result("one", 1), replayEvidence: { kind: "other", huge: { nested: true } } }), /replay/i);
  assert.throws(() => validateChallenge({ id: "challenge_x", challengerId: "actor_x", targetActorId: "", sourcePostId: "post_x", playableRef: ref, challengerResultId: "result_x", state: "open", createdAt: "2026-09-18T00:00:00.000Z" }), /invalid/i);
  const normalized = validatePost({ id: "post_x", creatorId: "creator_x", createdAt: "2026-09-18T00:00:00.000Z", caption: "Valid", playableRef: ref, resultPolicy: { kind: "higher_score" }, status: "published", preview: { kind: "poster", tone: "violet", ignored: true }, ignored: true });
  assert.deepEqual(normalized.preview, { kind: "poster", tone: "violet" });
  assert.equal("ignored" in normalized, false);
});

test("transient play attempts have no social identity and strip unknown fields", () => {
  const attempt = validatePlayAttempt({ playableRef: ref, status: "completed", metric: 47, createdAt: "2026-09-18T00:00:00.000Z", verification: "trusted_shell_local", replayEvidence: { kind: "local_snapshot", elapsedMs: 1200 }, postId: "post_fake", id: "result_fake", arbitrary: true });
  assert.equal("postId" in attempt, false);
  assert.equal("id" in attempt, false);
  assert.equal("arbitrary" in attempt, false);
  assert.deepEqual(attempt.replayEvidence, { kind: "local_snapshot", elapsedMs: 1200 });
});
