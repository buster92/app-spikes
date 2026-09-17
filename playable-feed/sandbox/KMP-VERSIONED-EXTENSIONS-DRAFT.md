# Playloop KMP versioned runtime extensions draft

The base KMP contract in `KMP-RUNTIME-CONTRACT-V0.md` remains the migration boundary: creator content is data, logical runtime state lives in `commonMain`, and rendering/input/media stay behind platform adapters.

This document records how the experimental v1/v2/v3 capabilities should map to Kotlin without changing that boundary.

## Runtime dispatch

Do not fork the whole engine per runtime id.

A native client should parse the declared runtime first and enable an explicit capability set:

```kotlin
enum class RuntimeVersion {
    V0,
    V1,
    V2,
    V3,
}

data class RuntimeCapabilities(
    val entityReads: Boolean,
    val entityLocalState: Boolean,
    val scalarCollections: Boolean,
    val boundedGrids: Boolean,
)
```

The runtime core remains shared. Validation/execution dispatches version-specific expressions/actions only when the GameSpec runtime permits them.

```text
wire GameSpec
    ↓
parse runtime id
    ↓
validate exact version contract
    ↓
shared RuntimeCore(capabilities)
```

An old v0 game must not acquire v1/v2/v3 behavior merely because the installed app supports newer runtimes.

## v1 mapping: entity reads + local state

Suggested common model:

```kotlin
@Serializable
data class EntitySpec(
    // existing transform/render fields
    val state: Map<String, JsonPrimitive> = emptyMap(),
)

sealed interface Expression {
    data class EntityField(
        val ref: EntityRef,
        val field: EntityFieldName,
    ) : Expression

    data class EntityState(
        val ref: EntityRef,
        val key: String,
    ) : Expression
}

sealed interface Action {
    data class SetEntityState(
        val entity: EntityRef,
        val key: String,
        val value: Expression,
    ) : Action

    data class AddEntityState(
        val entity: EntityRef,
        val key: String,
        val value: Expression,
    ) : Action
}
```

Runtime entity state should be represented as a bounded mutable scalar map owned by `commonMain`.

Important parity details:

- max 8 keys/entity;
- finite number / boolean / short string / null only;
- event-scoped refs (`$target`, `$a`, `$b`) have the same availability rules as JS;
- missing read returns `null`;
- invalid numeric `addEntityState` fails deterministically;
- dynamic writes still enforce budgets at runtime, not only at publication validation.

## v2 mapping: bounded scalar collections

Suggested model:

```kotlin
@Serializable
data class GameSpec(
    // existing fields
    val collections: Map<String, List<JsonPrimitive>> = emptyMap(),
)

sealed interface Expression {
    data class CollectionLength(val name: String) : Expression
    data class CollectionAt(val name: String, val index: Expression) : Expression
    data class CollectionFirst(val name: String) : Expression
    data class CollectionLast(val name: String) : Expression
}

sealed interface Action {
    data class PushCollection(val name: String, val value: Expression) : Action
    data class SetCollectionItem(val name: String, val index: Expression, val value: Expression) : Action
    data class RemoveCollectionAt(val name: String, val index: Expression) : Action
    data class ClearCollection(val name: String) : Action
    data class ShuffleCollection(val name: String) : Action
}
```

Runtime state:

```kotlin
data class RuntimeState(
    // existing state
    val collections: MutableMap<String, MutableList<JsonPrimitive>>,
)
```

Budgets are part of semantics:

```text
max collections           8
max items / collection   16
item types                scalar only
string length            128 chars
```

The native runtime should not use Kotlin collection conveniences whose behavior differs across targets if they affect wire semantics.

## Deterministic shuffle

`shuffleCollection` is part of replay-visible state, so JS/Kotlin must use the same seeded PRNG and Fisher-Yates operation ordering.

Do **not** use:

```kotlin
list.shuffle()
Random.Default
SecureRandom
platform random APIs
```

Use the same explicit PRNG algorithm already defined by the runtime. For an initial `[0,1,2,3]` collection with seed `42`, the current JS reference fixture expects:

```text
[0, 3, 1, 2]
```

That fixture should become a Kotlin golden test.

## v3 mapping: bounded grids + occupancy

v3 extends the common serializable model rather than creating a platform-specific board engine.

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

@Serializable
data class GameSpec(
    // previous fields
    val grids: Map<String, GridSpec> = emptyMap(),
)

@Serializable
data class EntitySpec(
    // previous fields
    val grid: GridPlacement? = null,
)
```

Typed decoding is part of the contract: JSON strings such as `"5"` do not satisfy `columns: Int`. The JS validator intentionally follows the same rule rather than relying on coercion.

Current v3 budgets:

```text
max grids                 4
max columns / grid       10
max rows / grid          10
max cells / grid         64
max column span           4
max row span              4
```

The full grid rectangle must fit inside the GameSpec canvas. Initial placements must fit and must not overlap. Grid placement on templates is not available in v3.

### Grid-derived coordinates

For a grid-attached entity, `GridPlacement` owns logical position. Runtime render coordinates are derived exactly as:

```kotlin
x = originX + (column + columnSpan / 2.0) * cellWidth
y = originY + (row + rowSpan / 2.0) * cellHeight
```

A grid-attached entity must not declare wire `x/y` and cannot have non-zero velocity. Runtime code must keep `vx/vy == 0` and resnap `x/y` from the placement before logical snapshots/rendering.

Legacy x/y movement on a grid entity is invalid. Direct statically-known violations should fail validation; event-resolved violations must fail deterministically at runtime.

### Occupancy representation

Do not use platform hash iteration as logical ordering.

The simplest parity-safe implementation is to build a fresh bounded occupancy view for each grid query/action from current runtime entities:

```kotlin
fun occupancyForGrid(gridId: String, ignoreEntityId: String? = null): LinkedHashMap<Cell, String> {
    val occupied = linkedMapOf<Cell, String>()
    for (entity in runtimeEntitiesInInsertionOrder) {
        if (entity.id == ignoreEntityId || entity.grid?.grid != gridId) continue
        chargeOp() // visited grid entity
        for (cell in occupiedCellsRowMajor(entity.grid)) {
            chargeOp() // occupied cell materialized
            check(occupied.put(cell, entity.id) == null) // overlap is runtime failure
        }
    }
    return occupied
}
```

`LinkedHashMap` is illustrative; any KMP structure is acceptable if it preserves the required behavior. Creator rules never receive this map.

Required ordering:

1. runtime entities in insertion order;
2. for each placement, row ascending;
3. inside each row, column ascending.

Destroyed entities disappear from the next occupancy view immediately. Because a grid has at most 64 non-overlapping occupied cells, this scan is strictly bounded.

### Grid expressions

Suggested sealed forms:

```kotlin
sealed interface GridExpression : Expression {
    data class IsCellFree(
        val grid: String,
        val column: Expression,
        val row: Expression,
        val ignoreEntity: EntityRef? = null,
    ) : GridExpression

    data class Column(val entity: EntityRef) : GridExpression
    data class Row(val entity: EntityRef) : GridExpression

    data class CanMoveBy(
        val entity: EntityRef,
        val dx: Expression,
        val dy: Expression,
    ) : GridExpression

    data class PathClearToEdge(
        val entity: EntityRef,
        val direction: Expression,
    ) : GridExpression
}
```

Parity semantics:

- grid coordinates/deltas must resolve to integers;
- `isCellFree` returns `false` outside the board;
- `column`/`row` return `null` for a dynamic missing/non-grid entity;
- `canMoveBy` checks only the full destination placement, ignoring the moving entity's current cells;
- `canMoveBy` does not perform a swept-path test;
- `pathClearToEdge` is the explicit swept-lane operation;
- dynamic missing/non-grid refs return `false` for `canMoveBy`/`pathClearToEdge`;
- directions are `left`, `right`, `up`, `down`; an unsupported dynamic value returns `false`.

`pathClearToEdge` checks every lane covered by the entity span. Probe order is fixed:

```text
left/right: rows ascending, columns outward from the leading edge
up/down:    columns ascending, rows outward from the leading edge
```

Stop on the first occupied cell. If no cells exist between the leading edge and board edge, return `true`.

### Grid actions

Suggested actions:

```kotlin
sealed interface Action {
    data class MoveGridEntity(
        val entity: EntityRef,
        val column: Expression,
        val row: Expression,
    ) : Action

    data class MoveGridBy(
        val entity: EntityRef,
        val dx: Expression,
        val dy: Expression,
    ) : Action
}
```

Both actions check only the destination placement. An out-of-bounds or occupied destination fails with the same logical reason as JS (`grid_move_blocked`). A live non-grid dynamic target fails as `entity_not_on_grid`.

### Operation-budget parity

Grid helpers are bounded built-ins, but their internal work still participates in the interpreter budget.

The JS reference charges:

- one operation for the outer grid expression/action;
- one operation per grid entity visited while materializing occupancy;
- one operation per occupied cell materialized;
- one operation per destination/path cell probe;
- normal expression charges for coordinate/direction subexpressions.

KMP should mirror these charges before v3 is frozen so a spec does not pass one engine and fail the other near `maxOpsPerStep`.

Do not replace this with an unaccounted native pathfinding/search helper.

## Snapshot model

Native snapshots need to include all versioned creator state that can affect later logic:

```kotlin
@Serializable
data class RuntimeSnapshot(
    val status: RuntimeStatus,
    val elapsedMs: Long,
    val variables: Map<String, JsonPrimitive>,
    val entities: List<RuntimeEntitySnapshot>,
    val collections: Map<String, List<JsonPrimitive>> = emptyMap(),
    val result: RuntimeResult? = null,
)

@Serializable
data class RuntimeEntitySnapshot(
    // existing runtime fields
    val grid: GridPlacement? = null,
)
```

The static `grids` declarations remain in GameSpec and do not need to be copied into every snapshot. The mutable placement does.

For parity comparison:

- entity snapshots sorted by id before canonical comparison;
- map/object keys canonicalized;
- collection item order preserved;
- grid placement fields preserved exactly;
- floating values normalized consistently;
- no renderer/platform object included.

## Shared golden fixtures

Current reference fixtures should eventually run against both engines:

```text
v0  space-dodge-3s.replay.json
v1  pocket-shooter-v1-2s.replay.json
v1  garden-catch-v1-3s.replay.json
v2  pattern-echo-v2.replay.json
v3  bus-escape-v3.replay.json
```

The Kotlin test harness should consume the exact JSON GameSpec + replay files rather than duplicate them as Kotlin test data.

Target assertion:

```text
canonical(JS snapshot) == canonical(Kotlin snapshot)
```

for each capture and final state.

The v3 fixture additionally proves that destroying a bus immediately frees its occupied cells and changes later `pathClearToEdge` results without a second mutable occupancy source.

## Host-resource invariants

Adding runtime versions must not expand host authority.

`commonMain` remains unable to directly access:

- HTTP/network;
- filesystem paths;
- database/account tokens;
- social graph;
- payments/tips;
- camera/microphone;
- raw device ids;
- Android `Context`;
- UIKit objects.

The game can only request explicit bounded host effects already permitted by its runtime version.

## Native performance model

The native shell owns lifecycle pressure:

```text
feed metadata         cheap / many posts
GameSpec              small / prefetched selectively
creator assets        content-addressed / cached selectively
visible runtime       active
next runtime          optional bounded prefetch only
all others            no simulation
```

Collections/entity state/grid placements live in tiny `commonMain` structures and do not justify background work or a permanent render loop.

Static/puzzle games should sleep between input/timer deadlines just as the web host does.

## Gate before mobile migration

The JS reference exists to discover/freeze the language. Do not port every experimental idea immediately.

A sensible gate is:

1. v0-v3 creator pressure produces games worth keeping;
2. the wire/runtime semantics stop changing daily;
3. full JS tests and all replay fixtures are green;
4. KMP core implements validator + runtime + replay without rendering first;
5. JS↔Kotlin golden snapshots match, including Bus Escape grid placement/occupancy behavior;
6. operation-budget edge fixtures agree between engines;
7. only then integrate Skia/Compose/native feed lifecycle.

This avoids prematurely turning product-language exploration into two-platform maintenance work.
