import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { AUTHORING_GRAMMAR_V3 } from "../src/sandbox/authoring-grammar-v3.js";
import {
  evaluateCreatorPressureAttempt,
  summarizeCreatorPressure,
} from "../src/sandbox/creator-pressure-v3.js";
import { getRuntimeCapabilities } from "../src/sandbox/creator-tools.js";

const execFileAsync = promisify(execFile);
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

test("public v3 authoring grammar makes inherited condition syntax explicit", () => {
  const capabilities = getRuntimeCapabilities("playloop-2d-v3");

  assert.equal(capabilities.ok, true);
  assert.ok(capabilities.actions.includes("if"));
  assert.ok(capabilities.actions.includes("moveGridBy"));
  assert.ok(capabilities.expressions.gridOps.includes("canMoveBy"));
  assert.equal(AUTHORING_GRAMMAR_V3.inheritance.additive, true);
  assert.deepEqual(
    AUTHORING_GRAMMAR_V3.conditions.comparisonOperators,
    ["==", "!=", ">", ">=", "<", "<="],
  );
  assert.deepEqual(AUTHORING_GRAMMAR_V3.conditions.combinators, ["all", "any", "not"]);
  assert.equal(AUTHORING_GRAMMAR_V3.conditionalActions.elseOptional, true);
  assert.equal(AUTHORING_GRAMMAR_V3.conditionalActions.ruleLevelCondition, true);
  assert.equal(AUTHORING_GRAMMAR_V3.gridComposition.dynamicOccupantLookup, false);
  assert.equal(AUTHORING_GRAMMAR_V3.gridComposition.neighborAggregation, false);
  assert.equal(AUTHORING_GRAMMAR_V3.budgets.maxSpecBytes, 16 * 1024);
});

test("quick reference documents comparison, conditional and grid composition syntax", async () => {
  const reference = await readFile(resolve(root, "sandbox/GAMESPEC-AUTHORING-QUICK-REFERENCE.md"), "utf8");

  assert.match(reference, /Runtime ladder is additive/);
  assert.match(reference, /==\s+!=\s+>\s+>=\s+<\s+<=/);
  assert.match(reference, /Conditions compose with `all`, `any` and `not`/);
  assert.match(reference, /`if` is a normal action and uses `condition`, `then`, and optional `else`/);
  assert.match(reference, /\$target/);
  assert.match(reference, /"op": "canMoveBy"/);
  assert.match(reference, /"moveGridBy"/);
  assert.match(reference, /16 KB/);
  assert.match(reference, /dynamic `entityAtCell` \/ occupant lookup/);
});

test("generated pressure packet surfaces machine grammar before the long public references", async () => {
  const script = resolve(root, "src/sandbox/creator-pressure-v3-packet.mjs");
  const { stdout } = await execFileAsync(process.execPath, [script, "crate-push"], {
    maxBuffer: 5 * 1024 * 1024,
  });

  const machineIndex = stdout.indexOf("## Machine-readable runtime capabilities and authoring grammar");
  const materialsIndex = stdout.indexOf("## Public authoring materials");

  assert.ok(machineIndex >= 0);
  assert.ok(materialsIndex > machineIndex);
  assert.match(stdout, /"comparisonOperators": \[/);
  assert.match(stdout, /"combinators": \[/);
  assert.match(stdout, /"ifShape": \{/);
  assert.match(stdout, /"gridOps": \[/);
  assert.match(stdout, /"canMoveBy"/);
  assert.match(stdout, /"maxSpecBytes": 16384/);
  assert.match(stdout, /GAMESPEC-AUTHORING-QUICK-REFERENCE\.md/);
  assert.match(stdout, /Return exactly one raw JSON submission envelope and no prose or Markdown fences/);
});

test("pressure CLI preserves fenced external output as a measurable format failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "playloop-pressure-"));
  const submission = join(directory, "fenced.json");
  const cli = resolve(root, "src/sandbox/creator-pressure-v3-cli.mjs");
  const cases = resolve(root, "creator-pressure/v3-cases.json");

  try {
    await writeFile(submission, [
      "```json",
      "{",
      "  \"caseId\": \"crate-push\",",
      "  \"attempt\": 1,",
      "  \"status\": \"blocked\",",
      "  \"blockers\": [\"example\"]",
      "}",
      "```",
      "",
    ].join("\n"));

    const { stdout } = await execFileAsync(process.execPath, [cli, cases, submission], {
      maxBuffer: 5 * 1024 * 1024,
    });
    const report = JSON.parse(stdout);

    assert.equal(report.summary.totalAttempts, 1);
    assert.equal(report.summary.attemptedCases, 1);
    assert.equal(report.summary.firstPassValidCases, 0);
    assert.equal(report.summary.diagnosticCounts.MARKDOWN_FENCE, 1);
    assert.equal(report.results[0].caseId, "crate-push");
    assert.equal(report.results[0].attempt, 1);
    assert.equal(report.results[0].status, "format_error");
    assert.equal(report.results[0].diagnostics[0].code, "MARKDOWN_FENCE");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
