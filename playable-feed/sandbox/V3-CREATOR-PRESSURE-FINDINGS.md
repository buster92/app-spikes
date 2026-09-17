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

## External pressure: match-line

On 2026-09-17 two independent external models were given the public-only `match-line` packet. Both returned `blocked` rather than inventing unsupported opcodes.

Repeated blockers:

- no bounded occupant/entity-at-cell lookup;
- no bounded neighbor/run aggregation helper.

Additional blockers mentioned by one model included dynamic entity-reference storage, mutable piece values and awkward swapping.

This is meaningful evidence that match-line/match-3 is not naturally authorable from the current public v3 contract. It is **not yet evidence for a match-specific opcode**. The more general question is whether a bounded spatial query or neighbor helper unlocks several genres.

## External pressure: control and neighboring grid cases

A second batch used two independent models on `crate-push`, `ice-slide` and `lights-toggle`.

Observed results:

- `crate-push`: one model produced a valid first-pass v3 GameSpec that passed automated review; the other returned `blocked`.
- `ice-slide`: one model produced a valid first-pass v3 GameSpec that passed automated review; the other returned `blocked`.
- `lights-toggle`: one model submitted a v1 spec, but it exceeded the 16 KB GameSpec budget at 42,108 bytes; the other returned `blocked`.

The successful `crate-push` and `ice-slide` submissions are important controls: they show the public contract is expressive enough for at least some external authors without implementation access.

The blocked responses are also revealing because some cited capabilities that **do exist in the runtime**, such as conditional action blocks and equality/logical expressions. That means not every `blocked` result should be interpreted as a runtime gap. Some are evidence that the public authoring materials are incomplete or insufficiently discoverable.

Current interpretation by case:

- **Crate Push:** runtime capability is sufficient; improve public documentation before considering new primitives. A fixed known crate id is enough for the one-crate case, as both the internal reference and one external model demonstrate.
- **Ice Slide:** current primitives are at least sufficient to construct one valid solution, so do not add `raycast`/`slideUntilBlocked` yet. First understand how the successful author encoded it and whether that pattern is reasonable or excessively verbose.
- **Lights Toggle:** still unresolved. The oversized 42 KB submission suggests authoring ergonomics are poor even when a creator tries to encode the mechanic explicitly. The second model's neighbor-targeting complaint may point toward a bounded neighbor/occupant read, but public documentation gaps must be fixed before treating that as conclusive runtime evidence.

## Authoring-contract finding

The pressure packet currently includes the v0-v3 markdown drafts, `ai-tools-v3-draft.json` and the v0 schema. External feedback shows that the packet does not make conditional action syntax, comparison/logical expressions and related composition semantics obvious enough for all capable models.

Before changing v3 semantics, improve the public authoring materials so they contain concise, normative examples for:

- `if` / `then` / `else` action blocks;
- equality/comparison expressions;
- `all` / logical composition;
- reading `$target` entity-local state;
- composing `column` / `row` / `canMoveBy` with known entity ids;
- a small end-to-end grid interaction example that does not reveal implementation source.

Then rerun the same blocked control cases. If a model still reports a missing capability after the documented capability is explicit, that blocker is much stronger evidence.

## Deliberately difficult external cases

The pressure corpus includes mechanics expected to distinguish authoring friction from real language gaps:

- slide-until-obstacle;
- orthogonal-neighbor toggling;
- match-line detection after swaps;
- growing trail / dynamic grid occupancy.

A good external model should return `blocked` instead of inventing opcodes when a case cannot be represented honestly.

## Current decision before changing v3

Do **not** add `entityAtCell`, `matchLine`, `raycast`, loops or general scripting yet.

The next gate is to improve the public authoring contract and rerun the same external cases, especially `crate-push`, `ice-slide`, `lights-toggle` and `match-line`. The objective is to separate three different failure classes:

1. capability exists but documentation is insufficient;
2. capability exists but authoring is technically possible only through pathological verbosity;
3. capability genuinely does not exist.

Only category 3 should directly drive a runtime extension. Category 2 may justify a bounded ergonomic helper if it generalizes across genres.

## Evidence still required before freezing v3

- improve the public authoring contract around conditionals/comparisons/grid composition;
- rerun the public-only pressure packets against at least two external models;
- record first-pass validity and repair iterations;
- inspect repeated blocker categories after documentation gaps are removed;
- optionally add `growing-trail` when model quota is available; it is not required before fixing the authoring materials;
- keep the full JS test/replay suite green;
- implement equivalent Kotlin validation/runtime/replay behavior;
- compare JS↔Kotlin golden snapshots for Bus Escape and Crate Push;
- then decide whether v3 should be frozen or adjusted.
