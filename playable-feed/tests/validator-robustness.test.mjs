import test from "node:test";
import assert from "node:assert/strict";

import { RUNTIME_ID, packageProfile, validateGameSpec } from "../src/sandbox/game-spec.js";
import { RUNTIME_V1_ID, packageProfileV1, validateGameSpecV1 } from "../src/sandbox/game-spec-v1.js";
import { RUNTIME_V2_ID, packageProfileV2, validateGameSpecV2 } from "../src/sandbox/game-spec-v2.js";
import { RUNTIME_V3_ID, packageProfileV3, validateGameSpecV3 } from "../src/sandbox/game-spec-v3.js";

function malformed(runtime) {
  return {
    schemaVersion: 1,
    runtime,
    id: "malformed-contract",
    title: "Malformed contract",
    canvas: { width: 160, height: 240, background: "#000" },
    variables: {},
    assets: { not: "an-array" },
    templates: [],
    entities: { not: "an-array" },
    timers: { not: "an-array" },
    rules: { not: "an-array" },
    collections: [],
    grids: [],
  };
}

const cases = [
  ["v0", RUNTIME_ID, validateGameSpec, packageProfile],
  ["v1", RUNTIME_V1_ID, validateGameSpecV1, packageProfileV1],
  ["v2", RUNTIME_V2_ID, validateGameSpecV2, packageProfileV2],
  ["v3", RUNTIME_V3_ID, validateGameSpecV3, packageProfileV3],
];

for (const [label, runtime, validate, profile] of cases) {
  test(`${label} malformed container shapes return diagnostics instead of throwing`, () => {
    const spec = malformed(runtime);
    let validation;
    let packageResult;

    assert.doesNotThrow(() => {
      validation = validate(spec);
      packageResult = profile(spec);
    });

    assert.equal(validation.ok, false);
    assert.ok(Array.isArray(validation.errors));
    assert.ok(validation.errors.length > 0);
    assert.equal(packageResult.ok, false);
    assert.ok(Array.isArray(packageResult.errors));
    assert.ok(packageResult.errors.length > 0);
  });
}

test("v0 executable validator rejects schema-constrained creator fields", () => {
  const spec = {
    schemaVersion: 1,
    runtime: RUNTIME_ID,
    id: "schema-alignment",
    title: "Schema alignment",
    canvas: { width: 160, height: 240, background: "#000" },
    variables: {},
    assets: [],
    templates: {},
    entities: [{
      id: "bad",
      kind: "sprite",
      asset: "missing",
      width: 10,
      height: 10,
      collidable: "yes",
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 0,
      sourceHeight: 4,
    }],
    timers: [],
    rules: [{
      on: "start",
      actions: [{ sound: { asset: "missing", volume: 1.5 } }],
    }],
  };

  const result = validateGameSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("collidable")));
  assert.ok(result.errors.some((error) => error.includes("sourceWidth")));
  assert.ok(result.errors.some((error) => error.includes("sound.volume")));
});

test("v1 scans only expression-bearing base action fields", () => {
  const spec = {
    schemaVersion: 1,
    runtime: RUNTIME_V1_ID,
    id: "v1-expression-boundary",
    title: "V1 expression boundary",
    canvas: { width: 160, height: 240, background: "#000" },
    variables: { score: 0 },
    assets: [],
    templates: {},
    entities: [{ id: "player", kind: "circle", x: 20, y: 20, radius: 5 }],
    timers: [],
    rules: [{
      on: "start",
      actions: [
        { setVar: { name: "score", value: { entity: { ref: "player", field: "x" } } } },
        { destroy: { entity: "player" } },
      ],
    }],
  };

  const result = validateGameSpecV1(spec);
  assert.equal(result.ok, true, result.errors.join("\n"));
});
