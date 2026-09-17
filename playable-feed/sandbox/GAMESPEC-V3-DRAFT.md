# Playloop GameSpec v3 draft — bounded grid occupancy without scripting

`playloop-2d-v3` is an **experimental draft**, not a frozen public compatibility promise.

v3 exists because v0-v2 can express movement, local state, queues and short sequences, but traffic puzzles and board games still require too many low-level rules to answer simple spatial questions. v3 adds one capability family only: **small declarative grids with bounded occupancy queries and movement**.

The runtime ladder stays additive:

```text
playloop-2d-v0
  primitive entities + timers + collisions + global scalar variables

playloop-2d-v1 (draft)
  v0
  + bounded entity reads
  + bounded entity-local scalar state

playloop-2d-v2 (draft)
  v1
  + bounded scalar collections

playloop-2d-v3 (draft)
  v2
  + bounded grid declarations
  + initial entity grid placement
  + bounded occupancy/path queries
  + deterministic grid movement
```

v3 does **not** add loops, pathfinding callbacks, arbitrary arrays/objects, scripts, JavaScript, WASM, native code, network access, filesystem access, DOM access, social/account APIs, payments or unrestricted device APIs.

## Grid declaration

A v3 GameSpec declares grids in a top-level object:

```json
{
  "grids": {
    "yard": {
      "columns": 5,
      "rows": 5,
      "originX": 45,
      "originY": 150,
      "cellWidth": 54,
      "cellHeight": 54
    }
  }
}
```

Current hard limits:

```text
max grids                 4
max columns / grid       10
max rows / grid          10
max cells / grid         64
max entity column span    4
max entity row span       4
```

`columns` and `rows` are JSON integers, not numeric strings. Origins and cell sizes are finite JSON numbers and cell sizes are positive. The complete logical grid rectangle must fit inside the declared canvas. This keeps web and typed KMP decoding aligned and prevents a grid from depending on JavaScript number coercion or off-canvas host behavior.

## Entity placement

Only initial entities can be grid-attached in v3:

```json
{
  "id": "green-bus",
  "kind": "text",
  "grid": {
    "grid": "yard",
    "column": 0,
    "row": 0,
    "columnSpan": 2,
    "rowSpan": 1
  },
  "width": 104,
  "height": 38,
  "text": "→"
}
```

Rules:

- `column` and `row` are zero-based non-negative integers;
- omitted spans default to `1`;
- each span is `1..4`;
- the full placement must fit inside the target grid;
- initial grid placements may not overlap;
- grid placement on templates is rejected in v3, so creator-driven spawn cannot manufacture new grid pieces;
- a grid-attached entity does not declare `x` or `y`;
- a grid-attached entity cannot have non-zero velocity.

The grid placement is the logical source of truth for position. Runtime `x/y` are derived for rendering from the cell center:

```text
x = originX + (column + columnSpan / 2) * cellWidth
y = originY + (row + rowSpan / 2) * cellHeight
```

Visual width/height do not change occupancy. A `2 x 1` logical piece can use any reviewed render primitive, but it always occupies exactly the two declared logical cells.

## Occupancy model

Occupancy is derived from the **currently live grid-attached entities**. Destroying an entity therefore frees its cells immediately. v3 does not keep a creator-owned mutable occupancy table that can drift out of sync with entity state.

The reference runtime builds a fresh bounded occupancy view for a grid operation:

1. iterate live entities in runtime insertion order;
2. include only entities attached to the requested grid and not explicitly ignored;
3. enumerate each entity's cells row-major (`row` ascending, then `column` ascending);
4. fail deterministically if runtime state somehow contains an overlap.

Because a grid contains at most 64 cells and overlapping placement is forbidden, occupancy work is bounded. Occupancy construction and cell probes count toward the same interpreted-operation budget as creator expressions/actions.

This exact ordering is replay-visible when operation budgets are approached and must be mirrored by a KMP implementation.

## Grid reads

### `isCellFree`

```json
{
  "grid": {
    "op": "isCellFree",
    "grid": "yard",
    "column": 3,
    "row": 1,
    "ignoreEntity": "$target"
  }
}
```

Semantics:

- `column` and `row` are bounded expressions that must resolve to integers;
- an out-of-grid coordinate returns `false`;
- `ignoreEntity` is optional and is useful when checking a placement against the entity itself;
- no search, callback or creator loop is exposed.

### `column` / `row`

```json
{ "grid": { "op": "column", "entity": "$target" } }
{ "grid": { "op": "row", "entity": "$target" } }
```

They return the current top-left grid coordinate. If a dynamic event reference resolves to a missing or non-grid entity, the read returns `null`. A direct reference to a known non-grid initial entity is rejected during validation.

### `canMoveBy`

```json
{
  "grid": {
    "op": "canMoveBy",
    "entity": "$target",
    "dx": 1,
    "dy": 0
  }
}
```

`dx` and `dy` must resolve to integers. The operation checks whether the entity's **destination placement** is inside the board and free while ignoring the entity's current cells.

It deliberately does not test every intermediate cell. A move by more than one cell can therefore cross occupied intermediate cells if the destination is free. Games that need a swept lane test must use `pathClearToEdge` or another future explicit bounded primitive. This avoids hiding pathfinding semantics inside a generic movement helper.

A dynamic reference that resolves to a missing/non-grid entity returns `false`.

### `pathClearToEdge`

```json
{
  "grid": {
    "op": "pathClearToEdge",
    "entity": "$target",
    "direction": { "entity": { "ref": "$target", "state": "direction" } }
  }
}
```

Directions are exactly:

```text
left
right
up
down
```

A literal unsupported direction is rejected statically. A dynamic unsupported direction returns `false`.

The query checks **every occupied lane of the entity span** from the leading edge to the board edge and returns `false` on the first occupied cell. It does not run general pathfinding or search around blockers.

Deterministic probe order:

- left/right: rows ascending, then columns moving outward from the entity;
- up/down: columns ascending, then rows moving outward from the entity.

If the entity is already on the requested edge and no cells exist ahead, the result is `true`.

## Grid movement actions

v3 adds two actions:

```json
{ "moveGridEntity": { "entity": "$target", "column": 2, "row": 3 } }
{ "moveGridBy": { "entity": "$target", "dx": 1, "dy": 0 } }
```

Both require integer runtime coordinates/deltas and validate the complete destination placement. The moving entity's current cells are ignored while testing its destination.

If the destination is occupied or outside the grid, runtime execution fails deterministically with `grid_move_blocked`. If a dynamic ref resolves to a live non-grid entity, execution fails with `entity_not_on_grid`. A missing dynamic entity is a no-op, matching the existing entity-action behavior.

Like `canMoveBy`, grid movement checks the destination, not a swept path.

Grid-attached entities cannot be moved by legacy `setEntity` / `moveEntity` x/y or velocity changes. Direct known violations are rejected statically; event-scoped violations are guarded at runtime with `grid_transform_controlled`. Rotation/opacity and v1 entity-local state remain normal bounded entity properties.

## Event-scoped references

v3 preserves the existing reference rules:

- `$target` only exists for target-bearing pointer/entity-exit events;
- `$a` and `$b` only exist for collision rules;
- direct ids must refer to known initial entities;
- direct ids used as grid-piece refs must identify grid-attached entities.

Grid operations do not grant a way to discover arbitrary host objects or enumerate host state.

## Reference game: Bus Escape

`examples/bus-escape-v3.game.json` is the first v3 pressure fixture.

It demonstrates:

- a 5x5 board;
- 1x2 and 2x1 pieces;
- direction stored in v1 entity-local state;
- `pathClearToEdge` for traffic-lane logic;
- v2 passenger/parking queues;
- destruction immediately freeing occupancy;
- deterministic score/result behavior;
- zero creator assets.

The example intentionally composes v1 + v2 + v3 rather than adding a game-specific Bus Escape API.

## Package and feed weight

v3 uses the same versioned transport/publication pipeline as older runtimes.

A public post carries a tiny content-addressed playable descriptor. The manifest points to a content-addressed GameSpec and reviewed content-addressed assets. GameSpec and assets stay lazy rather than being embedded into the social-feed record.

The existing hard spec-byte and asset budgets remain authoritative. A zero-asset v3 game such as Bus Escape can remain an instant-tier playable without adding media weight.

## Automated review and deterministic replay

`review-v3.js` binds automated review to the v3 validator, publication policy and runtime. `replay-v3.js` binds replay traces to the exact runtime id `playloop-2d-v3`.

`examples/replays/bus-escape-v3.replay.json` is the first grid golden fixture. For the same GameSpec, seed and input trace, JS and KMP must agree on logical state including:

- grid placement stored on entity snapshots;
- which entities remain live;
- collection contents and order;
- variables;
- result/status;
- deterministic timer/input ordering.

Pixel-identical rendering is not required.

## KMP mapping

The portable wire model should map directly to typed common code:

```kotlin
@Serializable
data class GridSpec(
    val columns: Int,
    val rows: Int,
    val originX: Double,
    val originY: Double,
    val cellWidth: Double,
    val cellHeight: Double,
)

@Serializable
data class GridPlacement(
    val grid: String,
    val column: Int,
    val row: Int,
    val columnSpan: Int = 1,
    val rowSpan: Int = 1,
)
```

`GameSpec` gains `grids: Map<String, GridSpec>`, and initial `EntitySpec` gains optional `grid: GridPlacement`.

KMP must implement occupancy/path operations in `commonMain`; Android/iOS renderers only consume the resulting entity coordinates/snapshots. No platform runtime receives creator code or a device/network handle.

See `KMP-VERSIONED-EXTENSIONS-DRAFT.md` for the exact iteration and replay contract.

## What v3 still does not solve

v3 intentionally does not add:

- arbitrary pathfinding;
- neighbors/match-line aggregation;
- nearest-entity searches;
- declarative tweens/animation tracks;
- physics components;
- dynamic grid templates/spawn;
- creator-defined loops or callbacks;
- creator network/storage/device/account/social/payment access.

Those remain separate capability decisions. A match-game pressure test may justify a later bounded `neighbors` or `matchLine` primitive; it should not be smuggled into v3 by generalizing expressions into a scripting language.

## Gate before freezing v3

Do not treat the v3 wire semantics as public merely because the JS reference works.

Before freezing compatibility:

1. keep the complete JS suite and v3 replay fixture green;
2. give external AIs only the public v3 authoring materials and measure repair iterations;
3. pressure-test at least one additional grid genre beyond Bus Escape;
4. implement matching Kotlin grid validation/occupancy semantics in `commonMain`;
5. compare JS↔Kotlin snapshots using the same Bus Escape replay fixture;
6. confirm operation budgets remain comfortable at maximum legal board occupancy;
7. then decide whether `playloop-2d-v3` is ready to become a durable creator target.
