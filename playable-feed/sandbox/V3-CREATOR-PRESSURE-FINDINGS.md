# v3 creator-pressure findings

This document records evidence from pressure-testing `playloop-2d-v3`. It is intentionally separate from the frozen contract documents because v3 is still experimental.

## Internal second-genre result: Sokoban-style pushing

Reference: `examples/sokoban-push-v3.game.json`

Result: **expressible with existing v3 primitives; no runtime extension required.**

The game uses a 5x5 board, a player, one crate, static wall occupancy, a non-occupying goal marker and four directional controls. A single tap rule reads `dx`/`dy` from the tapped control and:

1. computes the player's adjacent destination with `column` / `row` plus the direction delta;
2. compares that destination with the known crate position;
3. if the crate is adjacent, checks `canMoveBy` for the crate;
4. moves the crate first and then the player with `moveGridBy`;
5. otherwise checks and moves only the player;
6. completes when the crate coordinates equal the goal coordinates.

This exercises occupancy/movement semantics differently from Bus Escape. Bus Escape primarily asks whether an entire lane to an edge is clear and removes pieces. Crate Push repeatedly moves persistent grid entities by one cell and depends on occupancy being updated after each move.

The intended successful input sequence is:

```text
right, right, down, right, up, up
```

The deterministic replay fixture is `examples/replays/sokoban-push-v3.replay.json`.

## What this proves

The current v3 primitives can support at least two materially different grid interaction families:

- traffic/release puzzles using `pathClearToEdge`;
- push/occupancy puzzles using `column`, `row`, `canMoveBy` and `moveGridBy`.

This is evidence against adding a Sokoban-specific helper or general scripting capability.

## Pressure point exposed

The one-crate reference can address the crate by fixed id. With several interchangeable movable pieces, authoring becomes increasingly verbose because v3 does not expose a bounded query such as:

```text
occupantAt(grid, column, row)
entityAtCell(...)
```

A creator can still enumerate a small fixed set of known entity ids and compare each one's coordinates. That is valid but awkward.

Current decision: **do not add an occupant query yet.**

Reason: one internal reference is not enough evidence. External AI runs should tell us whether multiple independent creators repeatedly hit this same limitation. If they do, a bounded grid-occupant read may be a better future candidate than general loops/search.

## Deliberately difficult external cases

The pressure corpus includes mechanics expected to distinguish authoring friction from real language gaps:

- slide-until-obstacle;
- orthogonal-neighbor toggling;
- match-line detection after swaps;
- growing trail / dynamic grid occupancy.

A good external model should return `blocked` instead of inventing opcodes when a case cannot be represented honestly.

## Evidence still required before freezing v3

- run the public-only pressure packet with at least two external models;
- record first-pass validity and repair iterations;
- inspect repeated blocker categories;
- keep the full JS test/replay suite green;
- implement equivalent Kotlin validation/runtime/replay behavior;
- compare JS↔Kotlin golden snapshots for Bus Escape and Crate Push;
- then decide whether v3 should be frozen or adjusted.
