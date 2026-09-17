# Playloop GameSpec v2 draft — bounded collections without scripting

`playloop-2d-v2` is an **experimental draft**, not a frozen public compatibility promise.

It exists because the creator-pressure work found a repeated limitation that v1 still could not solve cleanly: short ordered state such as memory sequences, hands, queues and small inventories. v2 adds one capability only: **small scalar collections with deterministic bounded operations**.

The version ladder is intentionally narrow:

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
```

It does **not** add general arrays, loops, callbacks, lambdas, reflection or arbitrary code.

## Collection declaration

A GameSpec can declare up to 8 named collections:

```json
{
  "collections": {
    "pattern": [0, 1, 2, 3],
    "hand": ["fire", "ice", "heal"]
  }
}
```

Each collection:

- contains at most 16 items;
- contains only finite numbers, booleans, short strings or `null`;
- uses a safe lowercase id;
- has a maximum string item length of 128 characters.

Nested arrays/objects are rejected. Creator content cannot smuggle structured host objects into the runtime.

## Reads

v2 exposes four collection reads:

```json
{ "collection": { "name": "pattern", "op": "length" } }
{ "collection": { "name": "pattern", "op": "first" } }
{ "collection": { "name": "pattern", "op": "last" } }
{ "collection": { "name": "pattern", "op": "at", "index": { "var": "step" } } }
```

`at` uses a normal bounded expression for its index. If the dynamic index is outside the current collection, the read returns `null` rather than exposing host memory or growing the collection.

Collection expressions remain under the same maximum expression-depth budget as the rest of GameSpec.

## Mutations

The draft exposes only these actions:

```json
{ "pushCollection": { "name": "hand", "value": "fire" } }
{ "setCollectionItem": { "name": "hand", "index": 0, "value": "ice" } }
{ "removeCollectionAt": { "name": "hand", "index": 0 } }
{ "clearCollection": { "name": "hand" } }
{ "shuffleCollection": { "name": "hand" } }
```

Runtime enforcement remains authoritative even after static validation:

- pushing past 16 items fails the game/runtime review;
- writes must remain scalar;
- dynamic write/remove indexes must be integers and in bounds;
- shuffle uses the runtime seeded RNG and therefore participates in deterministic replay.

There is deliberately no `sort`, arbitrary predicate/filter, map/reduce, iterator or creator-defined loop.

## What this unlocks

The first reference example is `examples/pattern-echo-v2.game.json`.

`Pattern Echo` is a Simon-style memory game and demonstrates:

- a short pattern stored as data;
- deterministic `shuffleCollection` on game start;
- timer-driven indexed reads to display the pattern;
- v1 entity-local `slot` state on four tappable pads;
- comparing `$target.slot` against `pattern[input_index]`;
- deterministic completion/failure without game-specific JavaScript.

This directly addresses the repeated **bounded collections / sequence memory** blocker from `CREATOR-PRESSURE-V0.md`.

The same primitive can later support small card hands, passenger queues, short inventories, dialogue-choice pools and ordered challenge steps. It is not intended for hundreds of objects or general data processing.

## Why this remains lightweight

Collections live inside the GameSpec/runtime state; they do not add media downloads.

The transport rules remain unchanged:

- feed post carries only a tiny playable descriptor;
- GameSpec is lazy-loaded;
- reviewed assets remain content-addressed and lazy-loaded separately;
- instant-tier GameSpec still has the 16 KB spec budget and <=300 KB combined planning ceiling;
- off-screen games have no creator-owned background work.

`Pattern Echo` is intentionally zero-asset, showing that richer state does not require heavier posts.

## Determinism and replay

`src/sandbox/replay-v2.js` uses the same replay contract as earlier versions, but binds it to the explicit `playloop-2d-v2` runtime id.

Collections are included in runtime snapshots. A fixed GameSpec + seed + input trace must therefore produce equivalent:

- collection order after shuffle;
- indexed reads;
- scalar mutations;
- entity state;
- variables;
- result/status.

`examples/replays/pattern-echo-v2.replay.json` is the first collection golden fixture. With seed 42, the initial `[0,1,2,3]` pattern deterministically becomes `[0,3,1,2]` in the reference implementation.

That exact logical behavior is what a future KMP runtime must reproduce; pixel-identical rendering is not required.

## KMP mapping

The common model can stay small:

```kotlin
@Serializable
data class GameSpec(
    // existing fields
    val collections: Map<String, List<JsonPrimitive>> = emptyMap(),
)

sealed interface Expression {
    data class CollectionLength(val name: CollectionId) : Expression
    data class CollectionAt(val name: CollectionId, val index: Expression) : Expression
    data class CollectionFirst(val name: CollectionId) : Expression
    data class CollectionLast(val name: CollectionId) : Expression
}

sealed interface Action {
    data class PushCollection(val name: CollectionId, val value: Expression) : Action
    data class SetCollectionItem(val name: CollectionId, val index: Expression, val value: Expression) : Action
    data class RemoveCollectionAt(val name: CollectionId, val index: Expression) : Action
    data class ClearCollection(val name: CollectionId) : Action
    data class ShuffleCollection(val name: CollectionId) : Action
}
```

The mutable runtime representation belongs in `commonMain`. No collection operation receives a Kotlin object reference, Android `Context`, UIKit object, filesystem handle or network client.

## What v2 still does not solve

v2 intentionally does **not** add:

- grid occupancy or path queries;
- entity searches such as nearest/count-by-tag;
- declarative tween/animation tracks;
- state machines;
- pathfinding;
- physics;
- dynamic components;
- arbitrary scripting;
- creator network/storage/device access.

The next repeated creator-pressure problem is therefore not "make arrays more powerful." For Bus Jam, match games and traffic puzzles, the more appropriate next capability is a **bounded grid/occupancy layer** with known-complexity built-ins.

## Gate before treating v2 as real

Do not publish `playloop-2d-v2` merely because this reference implementation exists.

Before freezing wire semantics:

1. run the full JS sandbox suite locally;
2. keep deterministic collection replay fixtures as golden tests;
3. ask external AIs to author memory, card-hand and queue games using only public materials;
4. measure repair iterations, size and mechanical diversity;
5. confirm collections materially reduce rule explosion rather than merely moving complexity;
6. implement matching Kotlin collection/RNG semantics;
7. compare JS↔Kotlin snapshots for the same seeds and traces;
8. only then decide whether v2 becomes a public creator target.
