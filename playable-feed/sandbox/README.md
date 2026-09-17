# Playloop sandbox

This directory defines the creator-content boundary for a future Playloop platform.

The implementation proves that games can be loaded as bounded data rather than being compiled into the app, while keeping a migration path to Kotlin Multiplatform. The versioned runtime experiments are deliberately narrow: add one repeated creator need at a time, keep it deterministic, and never answer missing expressiveness by silently introducing arbitrary creator code.

> **Continuing this work in a fresh session?** Read [`NEXT-CHAT-HANDOFF.md`](./NEXT-CHAT-HANDOFF.md) first, then re-fetch PR #3 and the current branch head before editing. The handoff records product intent, architectural constraints, verification status and the recommended next sequence.

## Read in this order

1. [`NEXT-CHAT-HANDOFF.md`](./NEXT-CHAT-HANDOFF.md) — current session handoff and exact continuation priorities.
2. [`GAMESPEC-V0.md`](./GAMESPEC-V0.md) — runtime/security model and v0 GameSpec contract.
3. [`game-spec-v0.schema.json`](./game-spec-v0.schema.json) — machine-readable v0 authoring schema for tools/AIs.
4. [`ASSET-PIPELINE-V0.md`](./ASSET-PIPELINE-V0.md) — normalized media, hashes, atlases, caching and memory/network budgets.
5. [`PUBLISHING-PIPELINE-V0.md`](./PUBLISHING-PIPELINE-V0.md) — draft → automated review → moderation → signed public package.
6. [`KMP-RUNTIME-CONTRACT-V0.md`](./KMP-RUNTIME-CONTRACT-V0.md) — commonMain/platform split and migration invariants.
7. [`KMP-VERSIONED-EXTENSIONS-DRAFT.md`](./KMP-VERSIONED-EXTENSIONS-DRAFT.md) — v1/v2/v3 commonMain mappings and parity details.
8. [`REPLAY-CONTRACT-V0.md`](./REPLAY-CONTRACT-V0.md) — deterministic input/snapshot format for JS↔KMP parity and future ghosts/challenges.
9. [`AI-CREATOR-TOOLS-V0.md`](./AI-CREATOR-TOOLS-V0.md) — proposed API/MCP/plugin surface for external AIs.
10. [`ai-tools-v0.json`](./ai-tools-v0.json) — machine-readable stable-v0-oriented tool manifest.
11. [`CREATOR-PRESSURE-V0.md`](./CREATOR-PRESSURE-V0.md) — genre-by-genre pressure test showing what v0 can express and which missing primitives actually repeat.
12. [`EXPRESSIVENESS-ROADMAP.md`](./EXPRESSIVENESS-ROADMAP.md) — evidence-driven path toward richer games without arbitrary scripting.
13. [`GAMESPEC-V1-DRAFT.md`](./GAMESPEC-V1-DRAFT.md) + [`ai-tools-v1-draft.json`](./ai-tools-v1-draft.json) — experimental entity reads + bounded entity-local scalar state.
14. [`GAMESPEC-V2-DRAFT.md`](./GAMESPEC-V2-DRAFT.md) + [`ai-tools-v2-draft.json`](./ai-tools-v2-draft.json) — experimental bounded scalar collections for sequences/hands/queues.
15. [`GAMESPEC-V3-DRAFT.md`](./GAMESPEC-V3-DRAFT.md) + [`ai-tools-v3-draft.json`](./ai-tools-v3-draft.json) — experimental bounded grid/occupancy/path semantics and AI-facing authoring contract.

v3 is now wired through validation, publication transport/manifests, creator tools, Creator Lab, automated review, replay and CLI scripts. It is still an **experimental draft**, not a frozen/public compatibility promise.

## Runtime ladder

```text
playloop-2d-v0
  primitives + sprites + timers + collisions + scalar globals

playloop-2d-v1 (experimental)
  v0 + bounded entity reads + <=8 scalar state keys/entity

playloop-2d-v2 (experimental)
  v1 + <=8 scalar collections + <=16 items/collection

playloop-2d-v3 (experimental)
  v2 + <=4 bounded grids + occupancy/path-to-edge + deterministic grid movement
```

The experimental ids exist so prototype semantics cannot accidentally mutate v0. They are **not** publication promises yet.

## Reference implementation

The web reference under `../src/sandbox/` currently includes:

- bounded GameSpec validation;
- publication-policy validation;
- deterministic DOM-free runtime core;
- safety wrapper and runtime ceilings;
- Canvas renderer/input host;
- SHA-256 verified trusted image loading;
- sprite and sprite-atlas rendering;
- decoded-image memory budgets with reservations for concurrent decodes;
- disposal guards so late async decodes cannot recreate textures after the host is gone;
- visible+next asset residency/eviction policy;
- lightweight versioned transport planning and content-addressed publication envelopes;
- deterministic automated review probes;
- structured AI-authoring diagnostics/capabilities;
- deterministic replay traces for future KMP parity;
- creator CLIs mirroring future API/MCP operations;
- v1 entity reads and entity-local state;
- v2 bounded collections with deterministic shuffle/indexing;
- v3 bounded grid declarations, initial placements, occupancy/path queries and deterministic grid movement.

v3 occupancy is rebuilt from the current live entity set for each bounded query/action. Destroyed grid entities therefore free cells immediately without a second mutable occupancy source. Grid internals participate in the interpreter operation budget rather than hiding unmetered search work.

## Creator Lab

`../creator-lab.html` is a deliberately small manual authoring workbench for the stage before a real creator backend exists.

A person or external AI can:

1. generate/edit GameSpec JSON;
2. paste it into the editor;
3. validate it through the same authoring/publication gates;
4. run deterministic safety simulations;
5. execute it in the trusted Canvas sandbox.

The lab does not evaluate creator JavaScript and cannot resolve arbitrary creator URLs. Sprite games can only render reviewed assets already present in the host-controlled demo catalog.

The picker exposes v0, v1, v2 and the v3 `Bus Escape` proof through the corresponding trusted runtime class. Loading/running v3 does not bypass transport, validation or publication policy.

## Creator CLI

From `playable-feed/`:

```bash
npm run creator:capabilities
npm run creator:capabilities:v1
npm run creator:capabilities:v2
npm run creator:capabilities:v3

npm run creator:validate:v3
npm run creator:simulate:v3
npm run creator:manifest:v3
npm run review:v3
npm run replay:v3
```

The generic `creator:validate`, `creator:simulate` and `creator:manifest` commands remain available for the v0 example, with equivalent v1/v2 scripts retained.

The CLI returns JSON so an external AI/local agent can consume authoring feedback without Playloop source-code access. It does **not** publish, sign content, upload arbitrary executable code or grant player/social/payment APIs.

## Examples

- `meteor-dodge.game.json` — zero-asset continuous dodge.
- `tap-bloom.game.json` — zero-asset tap/reposition.
- `space-dodge.game.json` — background + tiny shared sprite atlas.
- `creator-star-catch.game.json` — AI-authored catch/avoid game using reviewed assets, no game-specific JavaScript.
- `whack-orb.game.json` — zero-asset moving-target game.
- `pocket-shooter-v1.game.json` — v1 projectile spawning from current entity position + player-local health.
- `garden-catch-v1.game.json` — visually unrelated frog/bee/berry game using the same v1 runtime and ~5.5 KB of image assets.
- `pattern-echo-v2.game.json` — zero-asset memory game using deterministic bounded collection shuffle/indexing.
- `bus-escape-v3.game.json` — zero-asset traffic/Bus-Escape-style composition of v1 entity state + v2 queues + v3 grid occupancy/path checks.
- `replays/space-dodge-3s.replay.json` — v0 replay fixture.
- `replays/pocket-shooter-v1-2s.replay.json` and `replays/garden-catch-v1-3s.replay.json` — v1 replay fixtures.
- `replays/pattern-echo-v2.replay.json` — v2 collection replay fixture.
- `replays/bus-escape-v3.replay.json` — v3 grid/occupancy replay fixture.

Open `../sandbox-demo.html` through a local HTTP server for v0 examples, or `../creator-lab.html` to inspect/edit/run the versioned GameSpec examples.

## v3 invariants worth preserving

The v3 draft intentionally chooses explicit semantics instead of JavaScript convenience:

- grid dimensions/coordinates are typed integers where the wire contract says integer; numeric strings are rejected;
- the full logical grid fits inside the canvas;
- initial placements fit, do not overlap and are the single source of truth for grid-entity position;
- grid entities cannot use velocity or legacy x/y movement;
- `canMoveBy` and grid move actions check the destination placement only;
- `pathClearToEdge` is the explicit bounded swept-lane primitive;
- occupancy iteration and path probe order are deterministic and documented for KMP parity;
- direct known non-grid refs are rejected statically, while event-resolved misuse is guarded at runtime;
- grid work counts toward `maxOpsPerStep`.

See `GAMESPEC-V3-DRAFT.md` for the exact semantics.

## Architectural rule

Creator content is never trusted application code.

```text
GameSpec + reviewed content-addressed assets
                  ↓
         validated runtime core
                  ↓
      host-controlled effects only
```

Likes, follows, comments, challenges, tips, payments, accounts, network access and device capabilities remain owned by the Playloop shell/backend rather than creator games.

The next step is **not** to add another language feature immediately. First keep v3 tests/replay green, pressure-test the public v3 contract with external AIs and another grid genre, and implement/compare the KMP core semantics. Only repeated creator pressure should justify the next bounded capability such as declarative animation/tweens or a reviewed match-line helper.
