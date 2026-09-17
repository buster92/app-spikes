# Playloop sandbox expressiveness roadmap

The sandbox only matters if creators can make things that do **not** all feel like reskins of the same few mechanics. At the same time, arbitrary creator scripting would undermine security, reviewability, performance, lightweight delivery and native portability.

The rule is therefore: **expand from observed creator pressure, one bounded capability at a time.**

## Evidence so far

The original v0 pressure test clustered around a surprisingly small set of missing capabilities:

1. entity reads;
2. entity-local scalar state;
3. bounded collections;
4. grid/occupancy queries;
5. declarative animation/tween polish;
6. reviewed high-level physics much later.

We are implementing that sequence rather than inventing a general scripting language.

## Current version ladder

### `playloop-2d-v0`

The base runtime supports:

- circles, rectangles, text and sprites;
- sprite atlases/source rectangles;
- seeded randomness;
- movement/velocity;
- bounds behavior;
- timers;
- pointer/tap events;
- collision events;
- global scalar variables;
- conditions and bounded math;
- spawning/destruction;
- score/results;
- semantic events, sound and haptic host requests.

This already covers dodge/survival, catch/avoid, moving targets, reaction/timing and simple chase patterns.

### `playloop-2d-v1` — experimental

v1 answers the first repeated pressure with only:

- bounded reads of whitelisted entity fields;
- reads of entity-local state;
- <=8 scalar state keys per entity;
- `setEntityState` / `addEntityState`.

It enables mechanics such as a projectile spawning from the player's current position and individual enemies/cards/resources carrying small local state.

`Pocket Shooter` and `Garden Catch` are the current reference examples.

### `playloop-2d-v2` — experimental

v2 answers the next repeated pressure with only:

- <=8 named scalar collections;
- <=16 items per collection;
- reads: `length`, `at`, `first`, `last`;
- mutations: push, set, remove, clear, deterministic shuffle.

There are still no loops/filter/map/reduce callbacks and no arbitrary arrays of objects.

`Pattern Echo` demonstrates a sequence-memory game driven by a deterministically shuffled collection and v1 entity-local pad state.

## Design rule for every new capability

A capability is eligible for the creator language only if we can answer all of these:

1. What is its bounded worst-case CPU cost?
2. What is its bounded memory/asset cost?
3. Can static publication review understand it?
4. Can deterministic automated review exercise it?
5. Can JS and KMP implement the same logical semantics?
6. Can the host suspend it completely off-screen?
7. Does it avoid giving the game arbitrary network/device/account access?
8. Does it materially expand creator range rather than merely shorten syntax?

If not, it belongs in the host app or a later explicit capability tier.

## Next mechanical candidate: grid / occupancy

Collections make sequences, hands and queues practical, but they do not make Bus Jam, Match-3, block puzzles or traffic puzzles pleasant to author.

Those genres repeatedly need spatial questions such as:

- which cell contains this piece?;
- is the next cell free?;
- which cells are occupied by this multi-cell object?;
- can this piece move N cells in its direction?;
- which adjacent cells match?;
- did this row/column form a bounded match?;
- is there a path to the board edge under a known movement rule?

Encoding those as dozens/hundreds of low-level rules would make AI authoring brittle and automated review less semantic.

A future grid capability should therefore be **high level and bounded**, for example:

```json
{
  "grid": {
    "id": "board",
    "columns": 6,
    "rows": 8,
    "cellWidth": 48,
    "cellHeight": 48
  }
}
```

Potential reviewed operations:

```text
isCellFree(grid, column, row)
cellOccupant(grid, column, row)
moveGridEntity(entity, column, row)
cellsAhead(entity, maxDistance)
neighbors(grid, column, row)
matchLine(grid, column, row, maxLength)
```

Every operation needs a strict board-size/search ceiling. No creator-defined pathfinding loop.

A useful acceptance test is whether a compact Bus Jam-like puzzle and a compact Match-3-like puzzle can both be expressed without special-case JavaScript.

## Parallel visual-quality track

Mechanical expressiveness is only half the Minecraft/mod-style ambition. Games also need to stop looking like the same framework.

The current reviewed asset path already provides an important base:

- generated/uploaded images are normalized outside GameSpec;
- public games reference SHA-256 assets rather than URLs;
- sprite atlases allow several characters/items in one tiny image;
- decoded-memory/network budgets remain host controlled;
- visual assets are lazy-loaded separately from feed metadata.

`Space Dodge` vs `Garden Catch` proves the same runtime can already support visually unrelated themes with only a few KB of raster assets.

The next visual primitives should remain declarative.

### Declarative frame animation

```json
{
  "animation": {
    "frames": [
      { "x": 0, "y": 0, "width": 32, "height": 32 },
      { "x": 32, "y": 0, "width": 32, "height": 32 }
    ],
    "frameMs": 120,
    "loop": true
  }
}
```

Hard limits: frame count, minimum frame duration and atlas bounds.

### Tweens

```json
{
  "tween": {
    "entity": "$target",
    "property": "x",
    "to": 320,
    "durationMs": 240,
    "easing": "outCubic"
  }
}
```

The runtime owns tween count/timing. No callbacks.

This is especially important for comprehension: boarding, departure, swapping, rewards and puzzle movement should visibly happen rather than state teleporting.

### Particles

Particles should be a renderer primitive rather than hundreds of full runtime entities:

```json
{
  "particles": {
    "preset": "burst",
    "count": 18,
    "lifetimeMs": 500,
    "color": "#ffd54a"
  }
}
```

The renderer can enforce a global particle budget and downgrade quality under device pressure.

## Later behavioral components

After grids and visual polish, two bounded ideas may increase variety substantially.

### Safe aggregate queries

Examples:

- count by tag;
- any/existence by tag;
- distance between two refs;
- nearest entity by tag with a strict candidate cap.

No arbitrary predicate lambdas.

### Tiny declarative state machines

```json
{
  "machine": {
    "initial": "idle",
    "states": ["idle", "chase", "flee"],
    "transitions": [
      { "from": "idle", "to": "chase", "when": { "...": "bounded condition" } }
    ]
  }
}
```

Limits on states/transitions preserve inspectability while allowing richer enemies/NPCs/puzzle pieces.

## Reusable reviewed components

Long term, Minecraft-like breadth probably needs versioned **data components**, not executable mods.

Examples:

```text
component: top_down_movement_v2
component: health_and_damage_v1
component: projectile_weapon_v1
component: match3_board_v1
component: traffic_escape_v1
component: dialogue_choices_v1
```

These are Playloop-maintained/reviewed runtime capabilities. AI composes/configures them. Creators do not ship the component implementation itself.

This gives the ecosystem reusable building blocks while preserving one secure portable engine.

## Why not arbitrary Lua/JavaScript?

A scripting language would make unsupported concepts easier immediately, but changes the product/security model:

- CPU termination becomes harder;
- memory behavior becomes harder to bound;
- static review loses semantic visibility;
- app-store/native execution constraints become more sensitive;
- malicious obfuscation becomes possible;
- deterministic JS↔KMP behavior becomes harder;
- network/device capability boundaries become much more complex.

A future scripting tier is not impossible, but should be considered only after the declarative/component approach has repeatedly failed under real creator demand and there is mature sandbox/security ownership.

## Versioning rule

Never silently expand old runtime semantics.

```text
v0  primitive state/events/assets
v1  + entity reads/local scalar state
v2  + bounded scalar collections
v3? + bounded grid/occupancy, only if pressure validates it
```

Old games keep their original semantics. New creator tooling can target a newer runtime. Remixing may later offer an explicit migration/upgrade operation.

## Validation program

For each candidate runtime version, give external models only the public authoring materials and ask them to build different genres.

Measure:

- valid on first attempt;
- repair iterations;
- spec/asset bytes;
- review result;
- deterministic replay result;
- mechanical similarity to existing examples;
- which primitive was missing;
- whether the game can be explained from GameSpec rather than hidden implementation knowledge.

The product goal is not maximum theoretical expressiveness. It is a small, portable language with enough combinatorial and visual range that players stop noticing the framework underneath the creations.
