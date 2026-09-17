# Playloop KMP versioned runtime extensions draft

The base KMP contract in `KMP-RUNTIME-CONTRACT-V0.md` remains the migration boundary: creator content is data, logical runtime state lives in `commonMain`, and rendering/input/media stay behind platform adapters.

This document records how the experimental v1/v2 capabilities should map to Kotlin without changing that boundary.

## Runtime dispatch

Do not fork the whole engine per runtime id.

A native client should parse the declared runtime first and enable an explicit capability set:

```kotlin
enum class RuntimeVersion {
    V0,
    V1,
    V2,
}

data class RuntimeCapabilities(
    val entityReads: Boolean,
    val entityLocalState: Boolean,
    val scalarCollections: Boolean,
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

An old v0 game must not acquire v1/v2 behavior merely because the installed app supports newer runtimes.

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
```

For parity comparison:

- entity snapshots sorted by id before canonical comparison;
- map/object keys canonicalized;
- collection item order preserved;
- floating values normalized consistently;
- no renderer/platform object included.

## Shared golden fixtures

Current reference fixtures should eventually run against both engines:

```text
v0  space-dodge-3s.replay.json
v1  pocket-shooter-v1-2s.replay.json
v1  garden-catch-v1-3s.replay.json
v2  pattern-echo-v2.replay.json
```

The Kotlin test harness should consume the exact JSON GameSpec + replay files rather than duplicate them as Kotlin test data.

Target assertion:

```text
canonical(JS snapshot) == canonical(Kotlin snapshot)
```

for each capture and final state.

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

Collections/entity state live in tiny `commonMain` structures and do not justify background work or a permanent render loop.

Static/puzzle games should sleep between input/timer deadlines just as the web host does.

## Gate before mobile migration

The JS reference exists to discover/freeze the language. Do not port every experimental idea immediately.

A sensible gate is:

1. v0/v1/v2 creator pressure produces games worth keeping;
2. the wire/runtime semantics stop changing daily;
3. full JS tests and replay fixtures are green;
4. KMP core implements validator + runtime + replay without rendering first;
5. JS↔Kotlin golden snapshots match;
6. only then integrate Skia/Compose/native feed lifecycle.

This avoids prematurely turning product-language exploration into two-platform maintenance work.
