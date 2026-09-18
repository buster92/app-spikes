import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeExperimentPayloads,
  mergeExportEvents,
  renderExperimentMarkdown,
} from "../src/experiment-report.js";

const EXPERIMENT = "onboarding_value_prop_v1";

function exposure({
  id,
  session,
  variant = "control",
  forced = false,
  sessionMs = 100,
}) {
  return {
    schema: 1,
    name: "experiment_exposure",
    event_id: id,
    session_id: session,
    session_ms: sessionMs,
    experiment_id: EXPERIMENT,
    variant_id: variant,
    forced,
    allocation_bucket: forced ? null : 123,
    variant_bucket: forced ? null : 456,
  };
}

function event({
  id,
  session,
  name,
  variant = "control",
  sessionMs,
  ...properties
}) {
  return {
    schema: 1,
    name,
    event_id: id,
    session_id: session,
    session_ms: sessionMs,
    experiment_context: { [EXPERIMENT]: variant },
    ...properties,
  };
}

test("merges multiple exports and deduplicates overlapping event ids", () => {
  const shared = event({ id: "shared", session: "s1", name: "feed_started", sessionMs: 200 });
  const merged = mergeExportEvents([
    { events: [shared, { ...shared, event_id: "unique-a" }] },
    { events: [shared, { ...shared, event_id: "unique-b" }] },
  ]);

  assert.equal(merged.length, 3);
  assert.equal(merged.filter((item) => item.event_id === "shared").length, 1);
});

test("excludes forced and conflicting sessions while collapsing duplicate exposures", () => {
  const report = analyzeExperimentPayloads([{
    events: [
      exposure({ id: "e1", session: "valid" }),
      exposure({ id: "e1-dup", session: "valid" }),
      event({ id: "f1", session: "valid", name: "feed_started", sessionMs: 200 }),

      exposure({ id: "forced", session: "forced-session", variant: "instant_play", forced: true }),

      exposure({ id: "conflict-a", session: "conflict", variant: "control" }),
      exposure({ id: "conflict-b", session: "conflict", variant: "instant_play" }),
    ],
  }], { experimentId: EXPERIMENT });

  const result = report.experiments[0];
  assert.equal(result.valid_exposed_sessions, 1);
  assert.equal(result.exclusions.forced_sessions, 1);
  assert.equal(result.exclusions.conflicting_variant_sessions, 1);
  assert.equal(result.exclusions.duplicate_exposure_events, 1);
  assert.equal(result.variants[0].feed_start.numerator, 1);
});

test("computes conversion, reach, timing and guardrails at session level", () => {
  const payload = {
    events: [
      exposure({ id: "c1e", session: "c1", variant: "control", sessionMs: 100 }),
      event({ id: "c1f", session: "c1", name: "feed_started", variant: "control", sessionMs: 900 }),
      event({ id: "c1i1", session: "c1", name: "game_impression", variant: "control", sessionMs: 1000, game_id: "g1", variant_id: "gv1" }),
      event({ id: "c1i", session: "c1", name: "game_first_interaction", variant: "control", sessionMs: 1400, game_id: "g1", variant_id: "gv1" }),
      event({ id: "c1r", session: "c1", name: "feed_reach_milestone", variant: "control", sessionMs: 4000, games_seen: 3 }),
      event({ id: "c1end", session: "c1", name: "session_end", variant: "control", sessionMs: 5000 }),

      exposure({ id: "c2e", session: "c2", variant: "control", sessionMs: 100 }),
      event({ id: "c2imp", session: "c2", name: "game_impression", variant: "control", sessionMs: 500, game_id: "g2", variant_id: "gv2" }),
      event({ id: "c2skip", session: "c2", name: "game_skip", variant: "control", sessionMs: 700, game_id: "g2", variant_id: "gv2" }),
      event({ id: "c2err", session: "c2", name: "client_error", variant: "control", sessionMs: 800 }),
      event({ id: "c2end", session: "c2", name: "session_end", variant: "control", sessionMs: 900 }),

      exposure({ id: "t1e", session: "t1", variant: "instant_play", sessionMs: 100 }),
      event({ id: "t1f", session: "t1", name: "feed_started", variant: "instant_play", sessionMs: 500 }),
      event({ id: "t1imp1", session: "t1", name: "game_impression", variant: "instant_play", sessionMs: 600, game_id: "g1", variant_id: "a" }),
      event({ id: "t1i", session: "t1", name: "game_first_interaction", variant: "instant_play", sessionMs: 700, game_id: "g1", variant_id: "a" }),
      event({ id: "t1imp2", session: "t1", name: "game_impression", variant: "instant_play", sessionMs: 1000, game_id: "g2", variant_id: "b" }),
      event({ id: "t1imp3", session: "t1", name: "game_impression", variant: "instant_play", sessionMs: 1400, game_id: "g3", variant_id: "c" }),
      event({ id: "t1r3", session: "t1", name: "feed_reach_milestone", variant: "instant_play", sessionMs: 1500, games_seen: 3 }),
      event({ id: "t1mount", session: "t1", name: "game_mount_error", variant: "instant_play", sessionMs: 1600 }),
    ],
  };

  const result = analyzeExperimentPayloads([payload], { experimentId: EXPERIMENT }).experiments[0];
  const control = result.variants.find((variant) => variant.variant_id === "control");
  const treatment = result.variants.find((variant) => variant.variant_id === "instant_play");

  assert.deepEqual(control.feed_start, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(control.first_interaction, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(control.reach_3, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.equal(control.median_feed_start_ms, 900);
  assert.equal(control.median_first_interaction_ms, 1400);
  assert.equal(control.median_games_seen, 1);
  assert.deepEqual(control.client_error_sessions, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(control.ended_before_feed_start, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(control.immediate_skip_without_interaction, { numerator: 1, denominator: 2, rate: 0.5 });

  assert.deepEqual(treatment.feed_start, { numerator: 1, denominator: 1, rate: 1 });
  assert.equal(treatment.median_games_seen, 3);
  assert.deepEqual(treatment.load_render_error_sessions, { numerator: 1, denominator: 1, rate: 1 });
});

test("flags relevant post-exposure events that are missing experiment context", () => {
  const report = analyzeExperimentPayloads([{
    events: [
      exposure({ id: "e1", session: "s1", variant: "control", sessionMs: 100 }),
      {
        schema: 1,
        name: "feed_started",
        event_id: "missing-context",
        session_id: "s1",
        session_ms: 200,
      },
      event({ id: "good", session: "s1", name: "game_first_interaction", sessionMs: 300 }),
    ],
  }], { experimentId: EXPERIMENT });

  const quality = report.experiments[0].data_quality;
  assert.equal(quality.unattributed_metric_events, 1);
  assert.equal(quality.sessions_with_unattributed_metric_events, 1);
});

test("renders a compact Markdown report with raw counts and directional deltas", () => {
  const report = analyzeExperimentPayloads([{
    events: [
      exposure({ id: "c", session: "c", variant: "control" }),
      event({ id: "cf", session: "c", name: "feed_started", variant: "control", sessionMs: 500 }),
      exposure({ id: "t", session: "t", variant: "instant_play" }),
      event({ id: "tf", session: "t", name: "feed_started", variant: "instant_play", sessionMs: 300 }),
      event({ id: "ti", session: "t", name: "game_first_interaction", variant: "instant_play", sessionMs: 400 }),
    ],
  }], { experimentId: EXPERIMENT });

  const markdown = renderExperimentMarkdown(report);
  assert.match(markdown, /Playloop experiment report/);
  assert.match(markdown, /100\.0% \(1\/1\)/);
  assert.match(markdown, /instant_play vs control/);
  assert.match(markdown, /first interaction \+100\.0 pp/);
  assert.match(markdown, /does not infer statistical significance/);
});

test("rejects inputs with no experiment exposure records", () => {
  assert.throws(
    () => analyzeExperimentPayloads([{ events: [] }]),
    /No experiment_exposure events/,
  );
});


test("does not treat null timing values as zero", () => {
  const report = analyzeExperimentPayloads([{
    events: [
      exposure({ id: "e-null", session: "s-null", variant: "control", sessionMs: 100 }),
      event({ id: "f-null", session: "s-null", name: "feed_started", variant: "control", sessionMs: null }),
    ],
  }], { experimentId: EXPERIMENT });

  assert.equal(report.experiments[0].variants[0].median_feed_start_ms, null);
});

test("explicitly requested experiment must exist in the supplied exports", () => {
  assert.throws(
    () => analyzeExperimentPayloads([{
      events: [exposure({ id: "e1", session: "s1" })],
    }], { experimentId: "missing_experiment" }),
    /Experiment not found in supplied exports/,
  );
});


test("post-exposure ordering stays correct when session timing is missing", () => {
  const firstExposure = {
    ...exposure({ id: "ordered-exposure", session: "ordered", variant: "control", sessionMs: null }),
    sequence: 10,
    ts: "2026-09-18T10:00:00.000Z",
  };
  const feedStarted = {
    ...event({
      id: "ordered-feed",
      session: "ordered",
      name: "feed_started",
      variant: "control",
      sessionMs: 500,
    }),
    sequence: 11,
    ts: "2026-09-18T10:00:00.500Z",
  };

  const report = analyzeExperimentPayloads([{
    events: [firstExposure, feedStarted],
  }], { experimentId: EXPERIMENT });

  assert.deepEqual(
    report.experiments[0].variants[0].feed_start,
    { numerator: 1, denominator: 1, rate: 1 },
  );
});
