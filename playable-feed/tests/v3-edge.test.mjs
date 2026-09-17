import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateGameSpecV3 } from "../src/sandbox/game-spec-v3.js";
import { SafeSandboxRuntimeV3 } from "../src/sandbox/runtime-v3.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function busEscape() {
  return JSON.parse(await readFile(resolve(root, "examples/bus-escape-v3.game.json"), "utf8"));
}

test("v3 grid dimensions require actual JSON integers rather than coercible strings", async () => {
  const spec = await busEscape();
  spec.grids.yard.columns = "5";
  const result = validateGameSpecV3(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("grids.yard.columns")));
});

test("v3 rejects obviously invalid literal grid coordinate and delta expressions", async () => {
  const readSpec = await busEscape();
  readSpec.rules.push({
    on: "tick",
    condition: {
      left: { grid: { op: "isCellFree", grid: "yard", column: "1", row: 0 } },
      op: "==",
      right: true,
    },
    actions: [],
  });
  const readResult = validateGameSpecV3(readSpec);
  assert.equal(readResult.ok, false);
  assert.ok(readResult.errors.some((error) => error.includes("literal grid coordinate/delta must be an integer")));

  const actionSpec = await busEscape();
  actionSpec.rules.push({
    on: "start",
    actions: [{ moveGridBy: { entity: "green-bus", dx: 0.5, dy: 0 } }],
  });
  const actionResult = validateGameSpecV3(actionSpec);
  assert.equal(actionResult.ok, false);
  assert.ok(actionResult.errors.some((error) => error.includes("literal grid coordinate/delta must be an integer")));
});

test("v3 rejects initial placements outside board bounds", async () => {
  const spec = await busEscape();
  spec.entities.find((entity) => entity.id === "gold-bus").grid.row = 4;
  const result = validateGameSpecV3(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("placement exceeds grid 'yard' bounds")));
});

test("v3 keeps declared grids inside the portable canvas coordinate space", async () => {
  const spec = await busEscape();
  spec.grids.yard.originX = 100;
  const result = validateGameSpecV3(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("horizontal grid bounds must fit inside the canvas")));
});

test("grid placement is the single source of truth for grid entity position", async () => {
  const withXY = await busEscape();
  withXY.entities.find((entity) => entity.id === "gold-bus").x = 10;
  const positionResult = validateGameSpecV3(withXY);
  assert.equal(positionResult.ok, false);
  assert.ok(positionResult.errors.some((error) => error.includes("grid placement controls position")));

  const withVelocity = await busEscape();
  withVelocity.entities.find((entity) => entity.id === "gold-bus").vx = 1;
  const velocityResult = validateGameSpecV3(withVelocity);
  assert.equal(velocityResult.ok, false);
  assert.ok(velocityResult.errors.some((error) => error.includes("cannot have non-zero velocity")));
});

test("v3 rejects invalid literal path directions but still permits bounded expressions", async () => {
  const spec = await busEscape();
  spec.rules[0].actions[0].if.condition.left.grid.direction = "diagonal";
  const result = validateGameSpecV3(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("must be left, right, up or down")));
});

test("direct grid reads and moves cannot target a known non-grid entity", async () => {
  const readSpec = await busEscape();
  readSpec.rules.push({
    on: "tick",
    condition: {
      left: { grid: { op: "column", entity: "queue-label" } },
      op: "==",
      right: 0,
    },
    actions: [{ haptic: { pattern: [1] } }],
  });
  const readResult = validateGameSpecV3(readSpec);
  assert.equal(readResult.ok, false);
  assert.ok(readResult.errors.some((error) => error.includes("'queue-label' is not attached to a grid")));

  const actionSpec = await busEscape();
  actionSpec.rules.push({
    on: "start",
    actions: [{ moveGridBy: { entity: "queue-label", dx: 1, dy: 0 } }],
  });
  const actionResult = validateGameSpecV3(actionSpec);
  assert.equal(actionResult.ok, false);
  assert.ok(actionResult.errors.some((error) => error.includes("'queue-label' is not attached to a grid")));
});

test("known grid entities cannot be moved with legacy x/y actions", async () => {
  const spec = await busEscape();
  spec.rules.push({
    on: "start",
    actions: [{ moveEntity: { entity: "gold-bus", x: 1, y: 0 } }],
  });
  const result = validateGameSpecV3(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("position/velocity must use v3 grid actions")));
});

test("runtime rejects event-scoped legacy movement when the resolved target is a grid entity", async () => {
  const spec = await busEscape();
  spec.rules[0].actions = [{ moveEntity: { entity: "$target", x: 1, y: 0 } }];
  const validation = validateGameSpecV3(spec);
  assert.equal(validation.ok, true, validation.errors.join("\n"));

  const runtime = new SafeSandboxRuntimeV3(spec, { seed: 1 });
  runtime.start();
  const gold = runtime.entities.get("gold-bus");
  assert.throws(
    () => runtime.pointer("tap", gold.x, gold.y),
    /position\/velocity must use v3 grid actions/,
  );
  assert.equal(runtime.status, "failed");
  assert.equal(runtime.result.reason, "grid_transform_controlled");
});

test("occupancy iteration is deterministic and bounded by occupied cells", async () => {
  const runtime = new SafeSandboxRuntimeV3(await busEscape(), { seed: 1 });
  runtime.start();
  runtime.operationCount = 0;

  const occupancy = runtime.occupancyForGrid("yard");
  assert.deepEqual(
    [...occupancy.entries()],
    [
      ["3,0", "gold-bus"],
      ["3,1", "gold-bus"],
      ["0,0", "green-bus"],
      ["1,0", "green-bus"],
      ["0,3", "blue-bus"],
      ["0,4", "blue-bus"],
      ["2,4", "red-bus"],
      ["3,4", "red-bus"],
    ],
  );
  assert.equal(runtime.operationCount, 12);
});

test("isCellFree supports explicit self-ignore and canMoveBy checks destination occupancy", async () => {
  const runtime = new SafeSandboxRuntimeV3(await busEscape(), { seed: 1 });
  runtime.start();

  assert.equal(runtime.evaluateExpression({
    grid: { op: "isCellFree", grid: "yard", column: 3, row: 0 },
  }, {}), false);
  assert.equal(runtime.evaluateExpression({
    grid: { op: "isCellFree", grid: "yard", column: 3, row: 0, ignoreEntity: "gold-bus" },
  }, {}), true);

  assert.equal(runtime.evaluateExpression({
    grid: { op: "canMoveBy", entity: "green-bus", dx: 1, dy: 0 },
  }, {}), true);
  assert.equal(runtime.evaluateExpression({
    grid: { op: "canMoveBy", entity: "green-bus", dx: 2, dy: 0 },
  }, {}), false);
});

test("grid-attached entities remain snapped to grid coordinates across runtime steps", async () => {
  const runtime = new SafeSandboxRuntimeV3(await busEscape(), { seed: 1 });
  runtime.start();
  const green = runtime.entities.get("green-bus");
  const expected = [green.x, green.y];

  green.vx = 500;
  green.vy = 500;
  runtime.step(50);

  assert.deepEqual([green.x, green.y], expected);
  assert.deepEqual([green.vx, green.vy], [0, 0]);
});
