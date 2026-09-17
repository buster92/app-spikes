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

## Initial pressure point exposed

The one-crate reference can address the crate by fixed id. With several interchangeable movable pieces, authoring becomes increasingly verbose because v3 does not expose a bounded query such as:

```text
occupantAt(grid, column, row)
entityAtCell(...)
```

A creator can still enumerate a small fixed set of known entity ids and compare each one's coordinates. That is valid but awkward.

The original decision was: **do not add an occupant query from the internal reference alone.** External AI runs should tell us whether multiple independent creators repeatedly hit this limitation.

## External pressure round 1: match-line

Date: 2026-09-17.

Two independent external models were given only the public creator-pressure packet for `match-line`. Both returned `blocked` rather than inventing unsupported opcodes.

Repeated blocker themes:

- no bounded occupant/entity-at-cell lookup;
- no bounded neighbor/run or match-line aggregation;
- difficulty identifying values/types of adjacent pieces dynamically.

Additional blockers reported by one model:

- no persistent dynamic entity-reference storage across interactions;
- entity visual/value mutation is intentionally limited;
- swapping occupied cells is awkward without an explicit bounded swap or a free-buffer workaround.

Interpretation: this is real evidence that match-style games stress spatial inspection beyond current v3. It is **not yet** enough evidence to choose a `matchLine`-specific primitive; a lower-level bounded spatial read could serve more genres.

## External pressure round 2: control + hostile grid cases

Date: 2026-09-17.

Two models were tested on `crate-push`, `ice-slide`, and `lights-toggle`.

### Crate Push

One external model produced a valid first-pass `playloop-2d-v3` GameSpec. Automated review passed with warnings only; the spec was about 5.3 KB and instant-tier eligible.

The second model returned `blocked`, claiming that conditional blocks and equality/logical comparison syntax were missing and also asking for an occupant lookup.

Because the first model successfully authored the same mechanic and the runtime already supports `if`, comparison conditions and fixed-id coordinate reads, the conditional/equality claims are **documentation/authoring-contract failures**, not runtime capability gaps.

Conclusion: **do not add a crate-specific or occupant primitive merely to make one-crate Sokoban work.** Improve the public authoring reference first.

### Ice Slide

One external model produced a valid first-pass `playloop-2d-v3` GameSpec. Automated review passed with warnings only; the spec was about 12.1 KB and instant-tier eligible.

The second model returned `blocked`, asking for loops, distance-to-obstacle/raycast data, or a `slideGridEntityUntilBlocked` action.

Since the first model found a valid bounded composition under the current contract, a slide/raycast primitive is **not justified by this pressure round**. The 12 KB size is worth watching, but the mechanic is currently expressible within the 16 KB limit.

### Lights Toggle

One external model attempted an implementation rather than declaring it blocked, but the GameSpec expanded to about 42.1 KB and was rejected by the 16 KB hard spec budget.

The second model returned `blocked`, again citing missing occupant/neighbor access and also incorrectly claiming the condition/`if` grammar was unavailable.

Interpretation: this case currently exposes **two separate problems**:

1. the public authoring packet did not make inherited condition syntax explicit enough;
2. naive fixed-id neighbor enumeration can create severe verbosity/budget pressure.

This is stronger evidence for investigating a reusable bounded neighbor/occupant capability than the one-crate case, but the documentation problem must be removed before changing runtime semantics.

## Documentation gap discovered

The external packet previously bundled the v0-v3 prose references, AI tool metadata and the v0 schema, but did not give a compact machine-readable description of the inherited condition grammar.

That allowed a model to see that `if` existed while still concluding that it had no documented way to construct:

- `left / op / right` comparison conditions;
- `==`, `!=`, `>`, `>=`, `<`, `<=`;
- `all`, `any`, `not`;
- `if.condition / then / else`;
- rule-level conditions;
- composition of `$target` entity-local state with v3 grid reads.

The pressure harness is therefore being hardened before more runtime capabilities are considered. The public packet now includes:

- a generated runtime-capability snapshot;
- an explicit machine-readable authoring grammar;
- `GAMESPEC-AUTHORING-QUICK-REFERENCE.md` with normative composition examples;
- an explicit 16 KB budget reminder;
- an instruction to treat v3 as additive over v0-v2 rather than reading the v3 grid document in isolation.

## Current capability decision

**Do not extend the v3 runtime yet.**

The evidence currently supports these distinctions:

- **Already expressible:** Bus Escape, one-crate Sokoban, and at least one bounded ice-slide implementation.
- **Documentation gap:** inherited conditions and conditional action syntax were too easy for an external model to miss.
- **Ergonomics/budget pressure:** lights-toggle can degenerate into large fixed-id enumeration and exceed the 16 KB budget.
- **Real capability candidate:** a bounded occupant/neighbor read remains plausible because it recurs in match-line and lights-toggle pressure, but it should be retested after the documentation fix.
- **Not justified yet:** general loops, raycasts, general scripting, game-specific `matchLine`, or game-specific `slideUntilBlocked` opcodes.

If the same occupant/neighbor limitation repeats after the hardened packet, prefer the smallest reusable bounded spatial primitive over a match-3-specific or scripting-like feature.

## Deliberately difficult remaining cases

The pressure corpus also includes:

- growing trail / dynamic grid occupancy;
- additional non-grid cases spanning v0-v2.

`growing-trail` is useful but is not required before the documentation rerun because the current batch already exposed a confounding authoring-contract problem.

## Evidence still required before freezing v3

- rerun selected external cases with the hardened packet and at least two independent models when practical;
- distinguish repeated true blockers from documentation/verbosity failures;
- keep the full JS test/replay suite green;
- implement equivalent Kotlin validation/runtime/replay behavior;
- compare JS↔Kotlin golden snapshots for Bus Escape and Crate Push;
- confirm operation budgets remain comfortable at maximum legal board occupancy;
- then decide whether v3 should be frozen or adjusted.
