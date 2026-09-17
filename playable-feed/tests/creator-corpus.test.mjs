import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateForAuthoring } from "../src/sandbox/creator-tools.js";
import { SafeSandboxRuntime } from "../src/sandbox/safe-runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function example(name) {
  return JSON.parse(await readFile(resolve(root, `examples/${name}.game.json`), "utf8"));
}

test("Whack Orb validates as a tiny zero-asset instant game", async () => {
  const result = validateForAuthoring(await example("whack-orb"));
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.profile.zeroAsset, true);
  assert.equal(result.transport.declaredAssetBytes, 0);
  assert.equal(result.transport.instantEligible, true);
  assert.ok(result.transport.firstPlayBytes < 8 * 1024);
});

test("the generic runtime completes moving-target Whack Orb without mechanic-specific code", async () => {
  const spec = await example("whack-orb");
  const runtime = new SafeSandboxRuntime(spec, { seed: 123 });
  runtime.start();

  for (let i = 0; i < 10 && runtime.status === "running"; i += 1) {
    const target = runtime.entities.get("target");
    assert.ok(target);
    runtime.pointer("tap", target.x, target.y);
  }

  assert.equal(runtime.status, "complete");
  assert.equal(runtime.variables.hits, 10);
  assert.equal(runtime.result.detail, "Ten hits");
  assert.ok(runtime.result.score >= 1000);
});

test("creator corpus currently demonstrates three distinct interaction families", async () => {
  const names = ["space-dodge", "creator-star-catch", "whack-orb"];
  const specs = await Promise.all(names.map(example));
  for (const spec of specs) assert.equal(validateForAuthoring(spec).ok, true, spec.id);

  const eventFamilies = specs.map((spec) => new Set(spec.rules.map((rule) => rule.on)));
  assert.equal(eventFamilies[0].has("collision"), true);
  assert.equal(eventFamilies[1].has("collision"), true);
  assert.equal(eventFamilies[2].has("tap"), true);
  assert.equal(eventFamilies[2].has("collision"), false);
});
