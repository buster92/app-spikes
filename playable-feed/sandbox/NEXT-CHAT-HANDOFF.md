# Playloop sandbox continuation handoff

This file exists so a fresh conversation can continue the Playloop creator-runtime work without relying on chat history.

**Always re-fetch PR #3 and the branch head before editing.** Treat this file as architecture/context plus the last known verification state, not as a substitute for reading current code.

## Repository / branch / PR

- Repository: `buster92/app-spikes`
- Branch: `feature/gamespec-sandbox-v0`
- Pull request: **#3 — Add portable Playloop GameSpec sandbox and creator runtime**
- Base: `main`
- Known head immediately before this verification refresh: `27d550df1b5beff703806cca9524bbf3bd0de4c8`
- PR was open and mergeable.
- GitHub Actions remain intentionally disabled; do not enable hosted CI unless the user explicitly changes that decision.

## Product direction

Playloop is evolving from a handcrafted mini-game feed into a **social platform for playable posts**.

The long-term creator experience should let a creator/influencer:

1. describe a small game to an AI;
2. preview/tune it;
3. submit it to automated review/moderation;
4. publish video/passive content plus an instantly playable experience;
5. let followers play, challenge and remix it.

Likes, comments, follows, profiles, recommendations, payments/tips, account state and other social/product capabilities belong to the trusted Playloop shell/backend. They are not creator-runtime APIs.

The production mobile runtime is expected to migrate toward Kotlin Multiplatform. The JS implementation remains the reference runtime while semantics are still being proven.

## Non-negotiable sandbox boundary

Creator content is **bounded declarative data**, never downloaded application code.

Do not add arbitrary JavaScript/eval, WASM, Lua/general scripting, native binaries, DOM access, network clients/arbitrary URLs, filesystem/storage/database handles, account/session tokens, social graph APIs, payment APIs, or unrestricted camera/microphone/sensor/device identity APIs.

The runtime must remain bounded, statically reviewable, deterministic enough for automated review and JS↔KMP parity, content-addressed for public packages/assets, fully suspendable off-screen, and versioned so published content does not silently change semantics.

`creator-tools.js` explicitly reports these creator authorities as unavailable: arbitrary code, network, DOM, filesystem, storage, social API, payments and device identity.

## Resource model

Current instant-tier targets:

- GameSpec <= **16 KB**;
- declared assets <= **256 KB**;
- combined first-play package <= **300 KB** for instant eligibility;
- normalized image <= **96 KB compressed**;
- decoded image <= **4 MB each**;
- creator decoded-image working set <= **8 MB**;
- <=64 runtime entities in the v0 baseline;
- <=2,000 interpreted operations per simulation step;
- max simulation step 50 ms;
- max runtime duration 60 s;
- feed descriptors stay only hundreds of bytes;
- playable packages/assets are lazy/content-addressed;
- only the visible runtime is active;
- at most one next playable is bounded-prefetched.

Static/puzzle games should sleep between input/timer deadlines rather than burn a permanent frame loop.

## Runtime ladder

### `playloop-2d-v0`

Reference foundation: shapes/text/sprites, reviewed content-addressed assets, movement/bounds, pointer input, timers, collisions, scalar variables, bounded expressions/actions, spawn/destroy, host-controlled effects, deterministic RNG, and hard operation/entity/time limits.

### `playloop-2d-v1` — experimental

Adds bounded entity reads plus <=8 scalar entity-local state keys and `setEntityState` / `addEntityState`.

Reference examples: `Pocket Shooter v1`, `Garden Catch v1`.

### `playloop-2d-v2` — experimental

Adds <=8 bounded scalar collections with <=16 values each, indexed/first/last reads, bounded mutation, and deterministic shuffle.

Reference example: `Pattern Echo v2`.

### `playloop-2d-v3` — experimental, integrated

Adds bounded grid/occupancy mechanics without scripting:

- <=4 grids;
- <=10 rows/columns and <=64 cells/grid;
- entity grid spans <=4x4;
- initial non-overlapping grid placement;
- `isCellFree`, `column`, `row`, `canMoveBy`, `pathClearToEdge`;
- `moveGridEntity`, `moveGridBy`;
- deterministic occupancy/probe iteration;
- grid internals charged against the same operation budget.

Reference example/replay: `Bus Escape v3`.

v3 is wired through validation, publication policy, the shared transport/manifests path, Creator Lab, creator tools/CLI, automated review and deterministic replay. It is **not** a frozen public compatibility promise yet.

Read `GAMESPEC-V3-DRAFT.md` and `KMP-VERSIONED-EXTENSIONS-DRAFT.md` before changing grid semantics.

## v3 semantics that must not drift

- Grid dimensions/coordinates use real JSON integers where the contract says integer; numeric strings are rejected.
- The entire grid rectangle must fit inside the canvas.
- Initial placements must fit and not overlap.
- Grid placement owns logical grid-entity position; wire `x/y` are rejected for grid entities.
- Grid entities cannot carry nonzero velocity.
- Occupancy is rebuilt from **currently live** grid entities instead of maintained as a second mutable creator table.
- Destroyed entities free occupancy immediately.
- Occupancy iteration is runtime entity insertion order, then cells row-major.
- `canMoveBy` and grid move actions validate only the destination placement.
- `pathClearToEdge` is the explicit swept-lane operation and probes every lane covered by the piece span in documented order.
- Direct known non-grid refs are rejected statically; event-resolved misuse is guarded at runtime.
- Dynamic coordinates/deltas must resolve to integers.
- Grid work contributes to `maxOpsPerStep`.
- Replay id is exactly `playloop-2d-v3`; older runtime ids cannot silently execute v3 traces.

## Transport/publication state

The old v3 transport gap is fixed. `transport.js` uses one versioned adapter for v0/v1/v2/v3, so v3 shares:

- package/profile budget validation;
- publication-policy validation;
- canonical JSON;
- SHA-256 GameSpec refs;
- unsigned publication manifests;
- content-addressed manifest refs;
- tiny feed descriptors;
- lazy asset accounting.

Do not introduce a v3-only transport bypass.

## Creator tooling / CLI / Lab

`creator-tools.js` supports v0-v3 and exposes exact v3 grid limits/directions while keeping creator host authority false.

Creator Lab includes `Bus Escape v3` and selects `SafeSandboxRuntimeV3` through the trusted runtime path.

Package scripts include v3 capabilities, validation, simulation, manifest, review and replay commands:

```bash
npm run creator:capabilities:v3
npm run creator:validate:v3
npm run creator:simulate:v3
npm run creator:manifest:v3
npm run review:v3
npm run replay:v3
```

`npm run check` syntax-checks the v3 validator/runtime/review/replay/CLI modules with the rest of the sandbox.

AI-facing materials include `GAMESPEC-V3-DRAFT.md`, `ai-tools-v3-draft.json`, and the v3 KMP mapping in `KMP-VERSIONED-EXTENSIONS-DRAFT.md`.

## Core correctness hardening completed during the whole-PR review

### Collision semantic roles

Physical collision insertion order no longer determines `$a` / `$b` when a rule declares `aTag` / `bTag`. `SandboxRuntime` canonicalizes the event to declared tag roles before matching/executing the rule. The duplicate implementation was removed from `SafeSandboxRuntime`.

### Geometry/schema alignment

Executable v0 validation was aligned with the published authoring schema on important runtime-visible fields: positive width/height, non-negative radius, opacity 0..1, source rectangles, interaction flags, text/color/string limits, sound volume, bounded finish/emit payloads and required action/rule shapes.

Explicit zero radius remains valid and is preserved by nullish runtime defaults.

### Host reporting of deterministic runtime failures

Operation-budget and similar runtime failures no longer escape the Canvas animation/timer/input loop and leave the host frozen. Terminal creator-runtime failures flow through optional `onRuntimeError` plus normal `onFinish(snapshot)`; unexpected host/programming errors while still running/idle propagate.

### Spawn identity

The safe/public runtime no longer lets a spawn silently replace a live entity:

- explicit fixed id already live → deterministic `spawn_id_collision`;
- fixed id can be reused after its previous entity is destroyed;
- generated `spawn-N` ids increase monotonically and skip live ids plus fixed ids reserved in rules.

The KMP contract records this because entity identity is replay-visible.

### Malformed creator input

Executable validators/package profilers for v0/v1/v2/v3 reject malformed container shapes as diagnostics instead of throwing internal `.map()`, `.forEach()`, `.entries()` or `.reduce()` exceptions.

### Validator extension boundaries

v1 extension scanning now inspects only expression-bearing fields of inherited base actions, so ordinary base payloads such as `destroy.entity` are not misread as v1 entity-read expressions. A direct regression test covers this case.

### Reference content integrity

- `Pattern Echo v2` now follows the lowercase-safe-id contract for variables.
- Demo asset catalog refs match the actual PNG SHA-256 contents, including `garden-bg.png`.

## Tests / verification — green

On **2026-09-17**, the full suite was run from the user's real repository checkout after the final validator/content fixes:

```text
npm test
144 tests
144 passed
0 failed
0 cancelled
0 skipped
0 todo

npm run check
completed successfully
```

This is the authoritative merge verification for the current implementation state before this documentation-only handoff commit.

Coverage includes:

- asset residency/content hashes and decoded-image budgets;
- runtime/schema validation and malformed creator input;
- deterministic runtime/replay across v0-v3;
- v1 entity state;
- v2 bounded collections;
- v3 grid placement/occupancy/path/movement semantics;
- creator capabilities/validation/simulation/publication candidates;
- shared v0-v3 transport envelopes;
- automated review;
- Canvas host operation-budget failure delivery;
- spawn identity/collision semantics;
- Creator Lab/package v3 dispatch.

## PR review / merge gates

All existing inline review threads are resolved:

- collision `aTag`/`bTag` role normalization;
- negative-radius validation;
- operation-budget failure reporting from the Canvas host;
- zero/default entity-dimension handling.

The changed-file list contains no `.github/workflows` entries. Hosted CI remains disabled as requested.

The final requirements audit before this handoff refresh confirmed:

- full local tests/checks are green;
- PR is mergeable;
- no unresolved review threads remain;
- shared versioned transport/publication covers v0-v3;
- no creator-controlled host authority was introduced;
- v3 Creator Lab/CLI/review/replay/transport integration is present;
- AI authoring docs/contracts are present;
- KMP v0-v3 mapping and replay-visible grid semantics are explicit;
- v3 remains experimental rather than falsely claiming JS↔Kotlin parity already exists.

**PR #3 is merge-ready as the current JS creator-runtime foundation.**

## Important files

Start with:

- `playable-feed/sandbox/README.md`
- `playable-feed/sandbox/GAMESPEC-V0.md`
- `playable-feed/sandbox/GAMESPEC-V1-DRAFT.md`
- `playable-feed/sandbox/GAMESPEC-V2-DRAFT.md`
- `playable-feed/sandbox/GAMESPEC-V3-DRAFT.md`
- `playable-feed/sandbox/KMP-RUNTIME-CONTRACT-V0.md`
- `playable-feed/sandbox/KMP-VERSIONED-EXTENSIONS-DRAFT.md`
- `playable-feed/sandbox/PUBLISHING-PIPELINE-V0.md`
- `playable-feed/sandbox/REPLAY-CONTRACT-V0.md`
- `playable-feed/sandbox/ai-tools-v3-draft.json`

Runtime/integration:

- `src/sandbox/game-spec.js`
- `src/sandbox/runtime-core.js`
- `src/sandbox/safe-runtime.js`
- `src/sandbox/game-spec-v1.js`, `runtime-v1.js`
- `src/sandbox/game-spec-v2.js`, `runtime-v2.js`
- `src/sandbox/game-spec-v3.js`, `runtime-v3.js`
- `src/sandbox/transport.js`
- `src/sandbox/creator-tools.js`
- `src/sandbox/creator-lab.js`
- `src/sandbox/review-engine.js`
- `src/sandbox/replay-engine.js`
- `src/sandbox/web-canvas-host.js`

Reference content:

- `examples/pocket-shooter-v1.game.json`
- `examples/garden-catch-v1.game.json`
- `examples/pattern-echo-v2.game.json`
- `examples/bus-escape-v3.game.json`
- `examples/replays/bus-escape-v3.replay.json`

## What should happen after merge

Do **not** immediately add an unrelated runtime capability.

Recommended next sequence:

1. pressure-test v3 with an external AI receiving only public authoring materials;
2. build at least one additional grid genre to test whether v3 generalizes beyond Bus Escape;
3. implement validator/runtime/replay core in KMP `commonMain`;
4. compare JS↔Kotlin golden snapshots, including operation-budget edge behavior;
5. only after those gates consider freezing v3 or adding another bounded capability.

Likely later candidates such as declarative tweens/animation or a bounded match-line helper must be justified by repeated creator pressure. Do not use general scripting as the shortcut.
