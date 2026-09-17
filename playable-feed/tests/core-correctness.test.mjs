import test from "node:test";
import assert from "node:assert/strict";

import { RUNTIME_ID, validateGameSpec } from "../src/sandbox/game-spec.js";
import { SandboxRuntime } from "../src/sandbox/runtime-core.js";
import { SafeSandboxRuntime } from "../src/sandbox/safe-runtime.js";
import { mountGameSpec } from "../src/sandbox/web-canvas-host.js";

function baseSpec() {
  return {
    schemaVersion: 1,
    runtime: RUNTIME_ID,
    id: "core-correctness",
    title: "Core correctness",
    canvas: { width: 160, height: 240, background: "#000000" },
    variables: { score: 0 },
    assets: [],
    templates: {},
    entities: [],
    timers: [],
    rules: [],
  };
}

function fakeCanvas() {
  const context = {
    fillStyle: "#000000",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect() {},
    fillText() {},
    beginPath() {},
    arc() {},
    fill() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    drawImage() {},
  };
  return {
    width: 0,
    height: 0,
    getContext() { return context; },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 160, height: 240 }; },
  };
}

test("runtime validation enforces the published geometry and opacity contract", () => {
  const negativeRadius = baseSpec();
  negativeRadius.entities.push({ id: "bad-radius", kind: "circle", x: 10, y: 10, radius: -1 });
  const radiusResult = validateGameSpec(negativeRadius);
  assert.equal(radiusResult.ok, false);
  assert.ok(radiusResult.errors.some((error) => error.includes("radius") && error.includes("non-negative")));

  const zeroWidth = baseSpec();
  zeroWidth.entities.push({ id: "bad-width", kind: "rect", x: 10, y: 10, width: 0, height: 10 });
  const widthResult = validateGameSpec(zeroWidth);
  assert.equal(widthResult.ok, false);
  assert.ok(widthResult.errors.some((error) => error.includes("width") && error.includes("positive")));

  const badOpacity = baseSpec();
  badOpacity.entities.push({ id: "bad-opacity", kind: "circle", x: 10, y: 10, radius: 1, opacity: 1.1 });
  const opacityResult = validateGameSpec(badOpacity);
  assert.equal(opacityResult.ok, false);
  assert.ok(opacityResult.errors.some((error) => error.includes("opacity")));
});

test("zero radius remains valid and is not replaced by the runtime default", () => {
  const spec = baseSpec();
  spec.entities.push({ id: "point", kind: "circle", x: 10, y: 10, radius: 0 });
  const validation = validateGameSpec(spec);
  assert.equal(validation.ok, true, validation.errors.join("\n"));

  const runtime = new SandboxRuntime(spec);
  assert.equal(runtime.entities.get("point").radius, 0);
});

test("raw runtime canonicalizes collision refs to aTag/bTag order", () => {
  const spec = baseSpec();
  spec.entities = [
    { id: "hazard", kind: "circle", tags: ["hazard"], x: 80, y: 120, radius: 10 },
    { id: "player", kind: "circle", tags: ["player"], x: 80, y: 120, radius: 10 },
  ];
  spec.rules = [{
    on: "collision",
    aTag: "player",
    bTag: "hazard",
    actions: [
      { destroy: { entity: "$b" } },
      { addVar: { name: "score", value: 1 } },
    ],
  }];

  const runtime = new SandboxRuntime(spec);
  runtime.start();
  runtime.step(0);

  assert.equal(runtime.entities.has("player"), true);
  assert.equal(runtime.entities.has("hazard"), false);
  assert.equal(runtime.variables.score, 1);
});

test("generated spawn ids skip live and fixed reserved ids", () => {
  const spec = baseSpec();
  spec.templates.dot = { kind: "circle", radius: 1 };
  spec.entities.push({ id: "spawn-1", kind: "circle", radius: 1 });
  spec.rules = [{
    on: "start",
    actions: [
      { spawn: { template: "dot" } },
      { spawn: { template: "dot", id: "spawn-2" } },
    ],
  }];

  const runtime = new SafeSandboxRuntime(spec);
  runtime.start();

  assert.equal(runtime.entities.has("spawn-1"), true);
  assert.equal(runtime.entities.has("spawn-2"), true);
  assert.equal(runtime.entities.has("spawn-3"), true);
  assert.equal(runtime.entities.size, 3);
});

test("explicit spawn ids cannot overwrite a live runtime entity", () => {
  const spec = baseSpec();
  spec.templates.dot = { kind: "circle", radius: 1 };
  spec.entities.push({ id: "existing", kind: "circle", radius: 1 });
  spec.rules = [{
    on: "start",
    actions: [{ spawn: { template: "dot", id: "existing" } }],
  }];

  const runtime = new SafeSandboxRuntime(spec);
  assert.throws(() => runtime.start(), /already in use/);
  assert.equal(runtime.status, "failed");
  assert.equal(runtime.result.reason, "spawn_id_collision");
  assert.equal(runtime.entities.get("existing").kind, "circle");
});

test("Canvas host reports operation-budget runtime failures through onFinish", () => {
  const spec = baseSpec();
  spec.entities = Array.from({ length: 64 }, (_, index) => ({
    id: `entity-${index}`,
    kind: "circle",
    x: 80,
    y: 120,
    radius: 1,
  }));
  spec.rules = [{
    on: "collision",
    actions: [{ addVar: { name: "score", value: 1 } }],
  }];
  const validation = validateGameSpec(spec);
  assert.equal(validation.ok, true, validation.errors.join("\n"));

  const previousDocument = globalThis.document;
  globalThis.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };

  let finishSnapshot = null;
  let runtimeError = null;
  let mounted = null;
  try {
    assert.doesNotThrow(() => {
      mounted = mountGameSpec(fakeCanvas(), spec, {
        onFinish: (snapshot) => { finishSnapshot = snapshot; },
        onRuntimeError: (error) => { runtimeError = error; },
      });
    });

    assert.ok(mounted);
    assert.equal(mounted.runtime.status, "failed");
    assert.equal(finishSnapshot?.status, "failed");
    assert.equal(finishSnapshot?.result?.detail, "Runtime operation budget exceeded");
    assert.match(runtimeError?.message || "", /operation budget exceeded/i);
    mounted.destroy();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
