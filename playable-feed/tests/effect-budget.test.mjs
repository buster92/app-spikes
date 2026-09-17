import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HOST_EFFECT_LIMITS, SafeSandboxRuntime } from "../src/sandbox/safe-runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function example() {
  return JSON.parse(await readFile(resolve(root, "examples/meteor-dodge.game.json"), "utf8"));
}

test("creator haptic spam is suppressed before it reaches the host", async () => {
  const spec = await example();
  spec.rules.push({
    on: "tick",
    actions: Array.from({ length: 16 }, () => ({ haptic: { pattern: [4] } })),
  });

  const effects = [];
  const runtime = new SafeSandboxRuntime(spec, {
    seed: 1,
    onEffect: (effect) => effects.push(effect),
  });
  runtime.start();
  for (let i = 0; i < 10 && runtime.status === "running"; i += 1) runtime.step(50);

  const haptics = effects.filter((effect) => effect.type === "haptic");
  assert.equal(haptics.length, HOST_EFFECT_LIMITS.haptic);
  assert.ok(runtime.safetyStats().suppressedHostEffects > 0);
});

test("terminal complete/fail effects are never swallowed by host-effect throttling", async () => {
  const spec = await example();
  spec.rules.unshift({
    on: "start",
    actions: [
      ...Array.from({ length: 8 }, () => ({ haptic: { pattern: [1] } })),
      { complete: { score: 1, detail: "done" } },
    ],
  });

  const effects = [];
  const runtime = new SafeSandboxRuntime(spec, { onEffect: (effect) => effects.push(effect) });
  runtime.start();

  assert.equal(runtime.status, "complete");
  assert.equal(effects.some((effect) => effect.type === "complete" && effect.detail === "done"), true);
});
