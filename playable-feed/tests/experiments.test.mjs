import test from "node:test";
import assert from "node:assert/strict";
import {
  ExperimentRegistry,
  PRODUCT_EXPERIMENTS,
  assignExperiment,
  parseExperimentOverrides,
} from "../src/experiments.js";

test("assignment is stable for the same anonymous identity", () => {
  const definition = PRODUCT_EXPERIMENTS.onboarding_value_prop_v1;
  const first = assignExperiment(definition, "anon_alpha");
  const second = assignExperiment(definition, "anon_alpha");
  assert.deepEqual(second, first);
  assert.equal(first.assigned, true);
  assert.ok(["control", "instant_play"].includes(first.variant_id));
});

test("different identities exercise both variants", () => {
  const definition = PRODUCT_EXPERIMENTS.onboarding_value_prop_v1;
  const variants = new Set(Array.from({ length: 100 }, (_, index) => assignExperiment(definition, `anon_${index}`).variant_id));
  assert.deepEqual([...variants].sort(), ["control", "instant_play"]);
});

test("allocation can hold identities out of an experiment", () => {
  const definition = {
    id: "partial_rollout",
    allocation: 0,
    variants: [
      { id: "control", weight: 1 },
      { id: "treatment", weight: 1 },
    ],
  };
  const assignment = assignExperiment(definition, "anon_alpha");
  assert.equal(assignment.assigned, false);
  assert.equal(assignment.variant_id, null);
});

test("valid debug overrides force a variant without changing the anonymous id", () => {
  const registry = new ExperimentRegistry({
    identity: "anon_alpha",
    search: "?exp=onboarding_value_prop_v1:instant_play",
  });
  const assignment = registry.assignment("onboarding_value_prop_v1");
  assert.equal(assignment.variant_id, "instant_play");
  assert.equal(assignment.forced, true);
});

test("invalid overrides are ignored rather than inventing variants", () => {
  const registry = new ExperimentRegistry({
    identity: "anon_alpha",
    search: "?exp=onboarding_value_prop_v1:not_real",
  });
  const assignment = registry.assignment("onboarding_value_prop_v1");
  assert.equal(assignment.forced, false);
  assert.ok(["control", "instant_play"].includes(assignment.variant_id));
});

test("exposure is emitted once and downstream context only contains exposed experiments", () => {
  const registry = new ExperimentRegistry({ identity: "anon_alpha" });
  const emitted = [];

  assert.deepEqual(registry.context(), {});
  const first = registry.expose("onboarding_value_prop_v1", (name, properties) => emitted.push({ name, properties }), {
    surface: "onboarding",
  });
  const second = registry.expose("onboarding_value_prop_v1", (name, properties) => emitted.push({ name, properties }));

  assert.equal(second, first);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].name, "experiment_exposure");
  assert.equal(emitted[0].properties.surface, "onboarding");
  assert.deepEqual(registry.context(), { onboarding_value_prop_v1: first });
});

test("override parser accepts repeated and comma-separated experiment overrides", () => {
  const overrides = parseExperimentOverrides("?exp=alpha:one,beta:two&exp=gamma:three");
  assert.deepEqual(Object.fromEntries(overrides), { alpha: "one", beta: "two", gamma: "three" });
});


test("caller metadata cannot override canonical exposure attribution", () => {
  const registry = new ExperimentRegistry({
    identity: "anon_alpha",
    search: "?exp=onboarding_value_prop_v1:instant_play",
  });
  const emitted = [];

  registry.expose(
    "onboarding_value_prop_v1",
    (name, properties) => emitted.push({ name, properties }),
    {
      surface: "onboarding",
      name: "not_an_exposure",
      experiment_id: "wrong_experiment",
      variant_id: "control",
      forced: false,
      allocation_bucket: 123,
      variant_bucket: 456,
      session_id: "wrong_session",
      event_id: "wrong_event",
      experiment_context: { wrong: "value" },
    },
  );

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].name, "experiment_exposure");
  assert.equal(emitted[0].properties.surface, "onboarding");
  assert.equal(emitted[0].properties.experiment_id, "onboarding_value_prop_v1");
  assert.equal(emitted[0].properties.variant_id, "instant_play");
  assert.equal(emitted[0].properties.forced, true);
  assert.equal(emitted[0].properties.allocation_bucket, null);
  assert.equal(emitted[0].properties.variant_bucket, null);
  assert.equal("name" in emitted[0].properties, false);
  assert.equal("session_id" in emitted[0].properties, false);
  assert.equal("event_id" in emitted[0].properties, false);
  assert.equal("experiment_context" in emitted[0].properties, false);
});

test("experiment context becomes active only after the exposure event is emitted", () => {
  const registry = new ExperimentRegistry({ identity: "anon_alpha" });
  let contextDuringEmit = null;

  registry.expose("onboarding_value_prop_v1", () => {
    contextDuringEmit = registry.context();
  });

  assert.deepEqual(contextDuringEmit, {});
  assert.notDeepEqual(registry.context(), {});
});
