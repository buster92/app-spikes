import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  packageProfileV1,
  validateGameSpecV1,
  validatePublicationPolicyV1,
} from "../src/sandbox/game-spec-v1.js";
import { SafeSandboxRuntimeV1 } from "../src/sandbox/runtime-v1.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function shooter() {
  return JSON.parse(await readFile(resolve(root, "examples/pocket-shooter-v1.game.json"), "utf8"));
}

test("v1 shooter validates and remains instant-tier data", async () => {
  const spec = await shooter();
  const validation = validateGameSpecV1(spec);
  const publication = validatePublicationPolicyV1(spec);
  const profile = packageProfileV1(spec);

  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(publication.ok, true, publication.errors.join("\n"));
  assert.equal(profile.ok, true, profile.errors.join("\n"));
  assert.equal(profile.instantEligible, true);
  assert.ok(profile.metrics.specBytes < 16 * 1024);
  assert.equal(profile.metrics.declaredAssetBytes, 6700);
});

test("entity reads let a projectile spawn from current player state", async () => {
  const runtime = new SafeSandboxRuntimeV1(await shooter(), { seed: 7 });
  runtime.start();
  runtime.pointer("pointerDown", 123, 500);

  const bullet = [...runtime.entities.values()].find((entity) => entity.tags.includes("bullet"));
  assert.ok(bullet, "pointerDown should spawn a bullet");
  assert.equal(runtime.entities.get("player").x, 123);
  assert.equal(bullet.x, 123);
  assert.equal(bullet.y, 458);
  assert.equal(bullet.vy, -360);
});

test("entity-local state survives normalization and mutates through collision rules", async () => {
  const spec = await shooter();
  spec.entities.push({
    id: "forced-enemy",
    kind: "rect",
    tags: ["enemy"],
    x: 180,
    y: 492,
    width: 20,
    height: 20,
    color: "#f00",
    interactive: false,
    state: { damage: 1 }
  });

  const runtime = new SafeSandboxRuntimeV1(spec, { seed: 1 });
  runtime.start();
  assert.equal(runtime.entities.get("player").state.health, 3);
  runtime.step(0);
  assert.equal(runtime.entities.get("player").state.health, 2);
  assert.equal(runtime.entities.has("forced-enemy"), false);
});

test("spawned templates retain bounded local state", async () => {
  const runtime = new SafeSandboxRuntimeV1(await shooter(), { seed: 3 });
  runtime.start();
  for (let i = 0; i < 8; i += 1) runtime.step(50);
  const enemy = [...runtime.entities.values()].find((entity) => entity.tags.includes("enemy"));
  assert.ok(enemy, "spawn-enemy timer should create an enemy at 400ms");
  assert.equal(enemy.state.damage, 1);
});

test("v1 rejects entity reads that escape the current event/entity context", async () => {
  const spec = await shooter();
  spec.rules[0].actions[0].setEntity.x = { entity: { ref: "missing-player", field: "x" } };
  const result = validateGameSpecV1(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("missing-player")));

  const badEventRef = await shooter();
  badEventRef.rules.find((rule) => rule.on === "timer").actions.push({
    setVar: { name: "score", value: { entity: { ref: "$target", field: "x" } } }
  });
  const badEvent = validateGameSpecV1(badEventRef);
  assert.equal(badEvent.ok, false);
  assert.ok(badEvent.errors.some((error) => error.includes("$target")));
});
