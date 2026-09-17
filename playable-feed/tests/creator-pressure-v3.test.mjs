import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateCreatorPressureAttempt,
  summarizeCreatorPressure,
} from "../src/sandbox/creator-pressure-v3.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function json(relative) {
  return JSON.parse(await readFile(resolve(root, relative), "utf8"));
}

test("creator pressure corpus spans twelve cases and multiple capability tiers", async () => {
  const document = await json("creator-pressure/v3-cases.json");
  assert.equal(document.protocolVersion, 1);
  assert.equal(document.cases.length, 12);
  assert.equal(new Set(document.cases.map((entry) => entry.id)).size, 12);
  assert.ok(document.cases.some((entry) => entry.evaluationTags.includes("v0")));
  assert.ok(document.cases.some((entry) => entry.evaluationTags.includes("v1")));
  assert.ok(document.cases.some((entry) => entry.evaluationTags.includes("v2")));
  assert.ok(document.cases.some((entry) => entry.evaluationTags.includes("v3")));
  assert.ok(document.cases.some((entry) => entry.evaluationTags.includes("match-line")));
});

test("internal Sokoban reference passes the same pressure evaluator used for external attempts", async () => {
  const document = await json("creator-pressure/v3-cases.json");
  const pressureCase = document.cases.find((entry) => entry.id === "crate-push");
  const spec = await json("examples/sokoban-push-v3.game.json");
  const result = evaluateCreatorPressureAttempt({
    caseId: "crate-push",
    attempt: 1,
    author: { kind: "internal_reference", provider: "playloop", model: "hand-authored" },
    status: "submitted",
    spec,
  }, pressureCase, { seeds: [1], maxSimulatedMs: 1000 });

  assert.equal(result.status, "submitted");
  assert.equal(result.valid, true, result.diagnostics.map((entry) => entry.message).join("\n"));
  assert.equal(result.reviewOk, true, result.diagnostics.map((entry) => entry.message).join("\n"));
  assert.equal(result.runtime, "playloop-2d-v3");
  assert.equal(result.instantEligible, true);
  assert.ok(result.specBytes > 0);
});

test("blocked external attempts remain evidence instead of being treated as malformed GameSpecs", async () => {
  const document = await json("creator-pressure/v3-cases.json");
  const pressureCase = document.cases.find((entry) => entry.id === "match-line");
  const result = evaluateCreatorPressureAttempt({
    caseId: "match-line",
    attempt: 1,
    author: { kind: "external_ai", provider: "example", model: "example" },
    status: "blocked",
    blockers: ["Need bounded neighbor or match-line inspection"],
  }, pressureCase);

  assert.equal(result.status, "blocked");
  assert.equal(result.verdict, "blocked");
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.blockers, ["Need bounded neighbor or match-line inspection"]);
});

test("pressure summary measures first-pass success, repairs and capability blockers", async () => {
  const document = await json("creator-pressure/v3-cases.json");
  const crateCase = document.cases.find((entry) => entry.id === "crate-push");
  const matchCase = document.cases.find((entry) => entry.id === "match-line");
  const spec = await json("examples/sokoban-push-v3.game.json");

  const results = [
    evaluateCreatorPressureAttempt({
      caseId: "crate-push",
      attempt: 1,
      status: "submitted",
      spec,
    }, crateCase, { seeds: [1], maxSimulatedMs: 1000 }),
    evaluateCreatorPressureAttempt({
      caseId: "match-line",
      attempt: 1,
      status: "blocked",
      blockers: ["Need bounded match-line inspection"],
    }, matchCase),
  ];
  const summary = summarizeCreatorPressure(results, document.cases);

  assert.equal(summary.totalCases, 12);
  assert.equal(summary.attemptedCases, 2);
  assert.equal(summary.firstPassValidCases, 1);
  assert.equal(summary.firstPassReviewCases, 1);
  assert.equal(summary.blockedCases, 1);
  assert.equal(summary.runtimeCounts["playloop-2d-v3"], 1);
  assert.equal(summary.blockerCounts["Need bounded match-line inspection"], 1);
});
