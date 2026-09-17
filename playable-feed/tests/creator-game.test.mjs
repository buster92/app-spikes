import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateForAuthoring, simulateForAuthoring } from "../src/sandbox/creator-tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function creatorExample() {
  return JSON.parse(await readFile(resolve(root, "examples/creator-star-catch.game.json"), "utf8"));
}

test("AI-authored Star Catch stays inside the same public sandbox contract", async () => {
  const spec = await creatorExample();
  const result = validateForAuthoring(spec);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.transport.instantEligible, true);
  assert.ok(result.transport.feedDescriptorBytes < 512);
  assert.ok(result.transport.firstPlayBytes < 32 * 1024);
  assert.equal(spec.rules.some((rule) => Object.keys(rule).some((key) => key === "javascript" || key === "eval")), false);
});

test("AI-authored Star Catch survives deterministic automated runtime probes", async () => {
  const result = simulateForAuthoring(await creatorExample(), {
    seeds: [5, 17, 33],
    maxSimulatedMs: 3000,
  });
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.summary.crashes, 0);
  assert.equal(result.summary.seeds, 3);
});
