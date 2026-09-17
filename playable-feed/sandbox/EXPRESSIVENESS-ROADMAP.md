# Playloop sandbox expressiveness roadmap

The sandbox only matters if creators can make things that do **not** all feel like reskins of the same five mechanics. At the same time, arbitrary creator scripting would undermine security, reviewability, performance and native portability.

This document keeps those goals explicit.

## What v0 can already express

The current runtime is suitable for small real-time/tap games built from:

- circles, rectangles, text and sprites;
- sprite atlases/source rectangles;
- seeded random placement;
- movement/velocity;
- bounds behavior;
- timers;
- pointer/tap events;
- collision events;
- global variables;
- conditions and bounded math;
- spawning/destruction;
- score/result state;
- semantic events, sound and haptic host requests.

This can produce materially different games such as reaction targets, dodge/survival, catch/avoid, simple shooters, lane games, timed collection, chase patterns and some board-like interactions.

It is **not yet** enough for the Minecraft-like creator ambition. Complex board games, inventories, rich NPCs, pathfinding, card rules or deeply stateful simulations would currently require too much awkward rule expansion.

That limitation is intentional and should be measured rather than hidden.

## Design rule for every new primitive

A capability is eligible for the public creator language only if we can answer all of these:

1. What is its bounded worst-case CPU cost?
2. What is its bounded memory/asset cost?
3. Can static publication review understand it?
4. Can deterministic automated review exercise it?
5. Can JS and KMP implement the same logical semantics?
6. Can the host suspend it completely off-screen?
7. Does it avoid giving the game arbitrary network/device/account access?

If not, it belongs in the host app or a later explicitly capability-gated runtime.

## Near-term safe extensions

### 1. Declarative animation

Add atlas-frame animation without adding code:

```json
{
  "kind": "sprite",
  "asset": "hero-atlas",
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

Hard limits: frame count, minimum frame duration, atlas bounds.

This gives substantial visual life for very little network weight.

### 2. Tweens

A host/runtime action such as:

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

The runtime owns tween count and time. A creator cannot register arbitrary callbacks.

This covers satisfying movement, boarding/departure, UI transitions and many puzzle animations.

### 3. Entity reads

Expressions need a bounded way to inspect entity state:

```json
{ "entity": { "ref": "$target", "field": "x" } }
```

Allowed fields should be whitelisted (`x`, `y`, `vx`, `vy`, `rotation`, `opacity`, selected creator state). No reflection.

### 4. Entity-local state

Global variables become awkward quickly. Add a small bounded map of scalar entity state:

```json
{
  "state": {
    "health": 3,
    "team": "green"
  }
}
```

Hard limits on keys/value sizes make this reviewable while allowing cards, enemies, passengers, resources and puzzle pieces to behave differently.

### 5. Safe queries

Small aggregate queries remove huge rule duplication:

```json
{ "count": { "tag": "enemy" } }
```

Potential safe queries:

- count by tag;
- nearest entity by tag with a maximum search set;
- any/all tag existence;
- distance between two refs.

No arbitrary filter lambdas.

### 6. Particles

Particles should be a renderer primitive, not 500 normal entities.

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

The renderer enforces a global particle budget and can reduce quality under device pressure.

## Board/puzzle layer

To support things like Bus Jam, match games, block puzzles and traffic puzzles without writing hundreds of low-level rules, introduce bounded high-level board primitives.

Possible components:

### Grid

```json
{
  "grid": {
    "columns": 6,
    "rows": 8,
    "cellWidth": 48,
    "cellHeight": 48
  }
}
```

### Occupancy/path operations

Safe built-ins:

- `isCellFree`;
- `moveGridEntity`;
- `cellsAhead`;
- `neighbors`;
- `floodFillCount` with strict board-size caps;
- match-line detection for a bounded grid.

The runtime provides algorithms with known complexity. The creator describes rules around them.

This is preferable to letting AI emit general loops/pathfinding code.

## State machines

NPCs, enemies and puzzle objects benefit from a tiny declarative state machine:

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

Limits on states/transitions keep it inspectable. This can enable much richer behavior while remaining deterministic.

## Reusable creator components

A long-term creator system should allow trusted **data components**, not executable mods.

For example:

```text
component: top_down_movement_v2
component: health_and_damage_v1
component: projectile_weapon_v1
component: match3_board_v3
component: traffic_escape_v1
```

These are versioned runtime capabilities maintained/reviewed by Playloop. AI composes and configures them.

This is one path to Minecraft-like breadth without each post shipping code.

## Why not arbitrary Lua/JavaScript?

A scripting language would make some games easier to author, but it changes the security/product model dramatically:

- CPU termination becomes harder;
- memory behavior becomes harder to bound;
- review becomes less semantic;
- app-store/native execution constraints become more sensitive;
- network/device APIs need a much stronger capability model;
- deterministic cross-runtime behavior gets harder;
- malicious obfuscation becomes possible.

A future scripting tier is not impossible, but it should be considered only after the declarative/component model proves genuinely insufficient and there is a mature sandbox/security team.

## Capability versions

Do not continuously mutate one ambiguous runtime.

Example path:

```text
playloop-2d-v0   primitives + sprites + timers + collisions
playloop-2d-v1   animation + tween + entity state/queries
playloop-2d-v2   board/grid + state machines + particles
```

Old games keep their original semantics. New creator tools can target the newest supported runtime while remixing can optionally upgrade a game through a migration tool.

## Validation experiment before implementing v1

Use several AIs to create a corpus against v0 first.

Ask for genres such as:

- endless dodge;
- whack-a-mole;
- simple shooter;
- collect/avoid;
- timing game;
- memory game;
- mini traffic puzzle;
- tiny RPG combat;
- card-like choice game;
- physics-like stacker.

For each failed concept, record **which missing primitive forced the failure**. Implement capabilities based on repeated creator pressure, not speculation.

The product goal is not maximum theoretical expressiveness. It is a small language with enough combinatorial range that users stop noticing the framework underneath the creations.
