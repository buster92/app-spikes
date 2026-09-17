# Playloop deterministic replay contract v0

This contract gives the current JavaScript reference runtime and a future Kotlin Multiplatform runtime a shared input format for parity testing, debugging and eventually challenge/ghost features.

A replay contains no executable code. It is only a runtime/game identity, seed, duration and bounded pointer events.

## Trace shape

```json
{
  "formatVersion": 1,
  "runtime": "playloop-2d-v0",
  "gameId": "space-dodge",
  "seed": 42,
  "durationMs": 3000,
  "inputs": [
    { "atMs": 0, "type": "pointerDown", "x": 30, "y": 500 },
    { "atMs": 500, "type": "pointerMove", "x": 60, "y": 500, "dx": 30, "dy": 0 }
  ],
  "captureAtMs": [0, 1000, 2000, 3000]
}
```

v0 allows only `tap`, `pointerDown`, `pointerMove` and `pointerUp`. It is intentionally unable to encode arbitrary host/device actions.

## Ordering semantics

At each replay timestamp the runtime must:

1. advance simulation time to that timestamp in steps no larger than the runtime hard step limit;
2. process timers, integration, bounds and collision behavior as part of those normal steps;
3. apply pointer events scheduled at that timestamp in source order;
4. capture the logical snapshot after those inputs.

This ordering is part of the portability contract. KMP should match it rather than relying on platform frame callback ordering.

## Stable snapshot comparison

The JS reference replay harness:

- sorts entities by id;
- sorts object keys;
- rounds finite numeric values to six decimal places;
- captures status, elapsed runtime time, variables, entities and result.

Pixel-perfect rendering is not compared. The migration requirement is equivalent **logical state**.

## Why this matters beyond migration

The same bounded replay concept can later support:

- reproducible bug reports;
- server-side automated review traces;
- creator preview generation;
- player challenge attempts;
- lightweight ghost runs;
- moderation reproduction;
- deterministic regression fixtures.

A public social replay should still be treated as untrusted input and validated against the target game/runtime before execution.

## Current reference files

- `src/sandbox/replay.js` — validation, deterministic execution and stable snapshots.
- `src/sandbox/replay-cli.mjs` — JSON CLI output.
- `examples/replays/space-dodge-3s.replay.json` — first shared trace.
- `tests/replay.test.mjs` — determinism and snapshot normalization tests.

Run locally:

```bash
npm run replay:space
```

When the KMP engine begins, the same GameSpec + replay files should be included in common tests. The JS output can then be frozen as golden fixture data and compared with the Kotlin result without special-casing the game.
