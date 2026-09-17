# Playloop GameSpec v1 draft — structured state without scripting

`playloop-2d-v1` is an **experimental draft**, not a published compatibility promise. It exists because the v0 creator-pressure test repeatedly hit the same boundary: creators could move/spawn/collide entities, but could not safely read an entity's current state or keep small per-entity state.

The v1 prototype adds only those two capabilities before considering grids, collections, animation or physics.

## Why a new runtime id

Once creator games are public, their runtime semantics must not silently change with an app update.

```text
playloop-2d-v0
  primitive entities + timers + collisions + global scalar vars

playloop-2d-v1 (draft)
  v0 semantics
  + bounded entity reads
  + bounded entity-local scalar state
```

This lets the future native client support old games exactly while newer creator tools opt into richer semantics deliberately.

## Entity reads

A v1 expression can read a small whitelist of runtime-owned fields:

```json
{ "entity": { "ref": "player", "field": "x" } }
```

Allowed fields in the draft:

- `x`, `y`
- `vx`, `vy`
- `width`, `height`, `radius`
- `rotation`, `opacity`

The reference can be a known starting entity id or an event-scoped reference when that event actually provides it:

```text
$target   pointer/tap/entity-exit events
$a, $b    collision events
```

A timer rule cannot pretend it has `$target`, and a non-collision rule cannot access `$a/$b`.

This is enough to unlock an important class of mechanics. A shooter can now spawn a projectile from the player's **current** position without arbitrary code:

```json
{
  "spawn": {
    "template": "bullet",
    "x": { "entity": { "ref": "player", "field": "x" } },
    "y": { "sub": [
      { "entity": { "ref": "player", "field": "y" } },
      34
    ] }
  }
}
```

## Entity-local state

Entities/templates can carry at most **8 scalar state values**:

```json
{
  "id": "player",
  "kind": "sprite",
  "state": {
    "health": 3,
    "team": "blue"
  }
}
```

State values remain deliberately boring:

- finite number;
- boolean;
- short string;
- null.

No nested objects, arbitrary arrays, closures or host references.

Read state with:

```json
{ "entity": { "ref": "player", "state": "health" } }
```

Mutate it with two bounded actions:

```json
{ "setEntityState": { "entity": "player", "key": "health", "value": 3 } }
{ "addEntityState": { "entity": "player", "key": "health", "value": -1 } }
```

`addEntityState` is numeric-only at runtime; invalid dynamic math fails the game/review rather than producing silent `NaN` state.

## What this unlocks

The first reference example is `examples/pocket-shooter-v1.game.json`.

It demonstrates, without game-specific JavaScript:

- player steering;
- projectile spawn from the player's current coordinates;
- enemy spawning;
- projectile/enemy collision;
- score;
- player-local health;
- health decrement on collision;
- failure at zero health;
- reviewed sprite/background reuse.

This directly addresses one of the strongest repeated blockers from `CREATOR-PRESSURE-V0.md`.

## What v1 still does not add

The draft intentionally does **not** add:

- arbitrary scripting;
- loops/functions;
- network/storage/device access;
- arrays/decks/queues;
- grid occupancy/pathfinding;
- arbitrary entity queries;
- physics;
- dynamic components;
- creator-controlled coroutines/background work.

Those remain separate capability decisions with separate cost/review semantics.

## Reference implementation

- `src/sandbox/game-spec-v1.js` — v1 validation, policy adapter and package profile.
- `src/sandbox/runtime-v1.js` — v1 execution layer over the existing safe v0 runtime.
- `tests/v1.test.mjs` — validation, entity-read, local-state and template-state cases.
- `examples/pocket-shooter-v1.game.json` — first richer mechanic unlocked by the extension.

The v1 implementation deliberately reuses the v0 execution base rather than forking an entire second engine. Constructor-time validation uses a sanitized v0 representation, then execution restores the original v1 rules/templates and intercepts only the new expression/actions.

That is a prototype strategy, not necessarily the final KMP architecture. In KMP, v0/v1 should share a common runtime core with explicit capability/version dispatch rather than source-level duplication.

## Native mapping

The KMP equivalent remains straightforward:

```kotlin
sealed interface Expression {
    data class EntityField(val ref: EntityRef, val field: EntityFieldName) : Expression
    data class EntityState(val ref: EntityRef, val key: StateKey) : Expression
    // existing literals/math/random/etc.
}

data class RuntimeEntity(
    // existing transform/render/physics-lite fields
    val state: MutableMap<StateKey, JsonPrimitive>
)
```

The important rule remains the same: GameSpec can inspect only the state the runtime explicitly exposes. It never receives a native object, pointer, view, `Context`, filesystem handle or HTTP client.

## Gate before treating v1 as real

Do not publish `playloop-2d-v1` merely because the prototype exists.

Before promotion:

1. execute the v1 tests locally;
2. add deterministic replay fixtures that exercise entity reads/state mutation;
3. run external AI authoring against the v1 contract without source access;
4. confirm the added capabilities materially increase genre diversity;
5. implement matching Kotlin golden-fixture behavior;
6. freeze exact wire semantics only after those results are stable.
