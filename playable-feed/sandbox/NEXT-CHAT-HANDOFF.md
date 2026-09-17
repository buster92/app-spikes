# Playloop sandbox continuation handoff

This file exists so a fresh conversation can continue the Playloop creator-runtime work without relying on chat history.

**Always re-fetch PR #3 and the branch head before editing.** Repository state can move after this file is written. Treat this as architecture/context plus the last known verification status, not as a replacement for reading current code.

## Repository / branch / PR

- Repository: `buster92/app-spikes`
- Branch: `feature/gamespec-sandbox-v0`
- Pull request: **#3 — Add portable Playloop GameSpec sandbox and creator runtime**
- Base: `main`
- Known head immediately before this metadata-only handoff refresh: `bfc430103b5e2ca671651ab9f79688ca6b8c72f4`
- PR was open and mergeable.
- Do not work directly on `main` for this milestone.
- GitHub Actions are intentionally disabled; do not enable hosted CI unless the user explicitly changes that decision.

## Product direction

Playloop is evolving from a handcrafted mini-game feed into a **social platform for playable posts**.

The long-term creator experience should allow a creator/influencer to:

1. describe a small game to an AI;
2. preview/tune it;
3. submit it to automated review/moderation;
4. publish video/passive content plus an instantly playable experience;
5. let followers play, challenge and remix it.

Likes, comments, follows, profiles, recommendations, payments/tips, account state and other social/product capabilities belong to the trusted Playloop shell/backend. They are not creator-runtime APIs.

The production mobile runtime is expected to migrate toward Kotlin Multiplatform. The JS implementation is the reference language/runtime while semantics are still being discovered.

## Non-negotiable sandbox boundary

Creator content is **bounded declarative data**, never downloaded application code.

Do not add arbitrary JavaScript/eval, WASM, Lua/general scripting, native binaries, DOM access, network clients/arbitrary URLs, filesystem/storage/database handles, account/session tokens, social graph APIs, payment APIs, or unrestricted camera/microphone/sensor/device identity APIs.

The runtime must remain bounded, statically reviewable, deterministic enough for automated review and JS↔KMP parity, content-addressed for public packages/assets, fully suspendable off-screen, and versioned so published content does not silently change semantics.

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

v3 is wired through validation, publication policy, transport/manifests, Creator Lab, creator tools/CLI, automated review and deterministic replay. It is **not** a frozen public compatibility promise yet.

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

The old v3 transport gap is fixed. `transport.js` uses one versioned adapter for v0/v1/v2/v3, so v3 shares profile/budget validation, publication policy, canonical JSON, SHA-256 GameSpec refs, unsigned manifests, content-addressed manifest refs, tiny feed descriptors and lazy asset accounting.

Do not introduce a v3-only transport bypass.

## Creator tooling state

`creator-tools.js` supports v0-v3 and exposes exact v3 grid limits/directions while keeping creator host authority false.

Creator Lab includes `Bus Escape v3` and selects `SafeSandboxRuntimeV3` through the trusted runtime path.

Package scripts include:

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

Executable v0 validation was aligned with the published authoring schema on important runtime-visible fields:

- width/height > 0 if present;
- radius >= 0 if present;
- opacity 0..1;
- source rectangle shape/integer constraints;
- `collidable` / `interactive` booleans;
- text/color/string limits;
- sound volume 0..1;
- bounded finish detail and emit payloads;
- required rules/action structures.

Explicit zero radius remains valid and is preserved by nullish runtime defaults.

### Host reporting of deterministic runtime failures

Operation-budget and similar runtime failures no longer escape the Canvas animation/timer/input loop and leave the host frozen. If an operation throws after the runtime has entered a terminal status, the host routes it through optional `onRuntimeError` and normal `onFinish(snapshot)`. Unexpected host/programming errors while still running/idle propagate.

### Spawn identity

The safe/public runtime no longer allows a spawn to silently replace a live entity in the runtime map:

- explicit fixed id already live → deterministic `spawn_id_collision`;
- fixed id can be reused after its previous entity is destroyed;
- generated `spawn-N` ids increase monotonically and skip live ids plus fixed ids reserved anywhere in rules.

The KMP contract records this because entity identity is replay-visible.

### Malformed creator input

The executable validators/package profilers for v0/v1/v2/v3 were hardened so malformed container shapes (for example object-valued `entities`, `rules`, `assets`, or array-valued maps) are rejected as diagnostics rather than causing `.map()`, `.forEach()`, `.entries()` or `.reduce()` exceptions inside the validator itself.

`tests/validator-robustness.test.mjs` exercises that behavior across all four runtime ids.

## Tests added for hardening

`tests/core-correctness.test.mjs` covers geometry/opacity validation, zero-radius preservation, collision role canonicalization, generated/fixed spawn-id handling, explicit live spawn-id failure, and Canvas host operation-budget failure delivery.

v3 tests include `v3.test.mjs`, `v3-edge.test.mjs`, `v3-integration.test.mjs`, and `v3-replay.test.mjs`, covering grid validation/occupancy/path semantics, replay determinism, creator tools, transport/manifests, automated review, Creator Lab/package dispatch and KMP-sensitive cases.

`tests/validator-robustness.test.mjs` covers malformed container shapes across v0-v3 and executable-v0/schema alignment cases.

## PR review status

At the last review pass, all four existing inline review threads were resolved after fixes and regression coverage:

- collision `aTag`/`bTag` role normalization;
- negative-radius validation;
- operation-budget failure reporting from the Canvas host;
- zero/default entity-dimension handling.

Re-fetch review threads in a future session in case new comments appear.

The changed-file list contains no `.github/workflows` entries. Hosted CI remains disabled as requested.

## Verification status — be precise

A complete current `npm test` and `npm run check` has **not** been executed from a full checkout in the assistant environment because the local shell could not resolve `github.com` and the GitHub connector does not expose a mounted repository checkout.

What was actually executed earlier in a reconstructed text-only core slice:

- `node --check` for the then-current core validator/runtime/safe-runtime/web-host modules — passed;
- `tests/core-correctness.test.mjs` at that stage — **4/4 passed**, including a valid 64-overlapping-entity collision storm exhausting the 2,000-op budget and reaching `onFinish` as a failed runtime;
- trusted asset-loader concurrency/disposal slice — **3/3 passing**.

Later spawn-id, schema-alignment, malformed-input, and full v3 integration changes were added after those targeted runs. Do **not** claim the complete latest suite is green.

The first merge gate in a real checkout is therefore:

```bash
cd playable-feed
npm test
npm run check
```

Do not call the PR merge-ready if either fails.

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

## What should happen next

Do **not** add another unrelated runtime capability yet.

Recommended sequence:

1. re-fetch PR/head/review threads;
2. run the full local suite from a real repository checkout if the environment permits it;
3. fix any regression revealed by that suite;
4. perform one last diff-level audit for accidental duplication/stale docs/security/resource issues;
5. pressure-test v3 with an external AI receiving only public authoring materials;
6. build at least one additional grid genre to test whether v3 generalizes beyond Bus Escape;
7. implement validator/runtime/replay core in KMP `commonMain` and compare JS↔Kotlin golden snapshots;
8. only then consider freezing v3 or adding another bounded capability.

Likely later candidates such as declarative tweens/animation or a bounded match-line helper must be justified by repeated creator pressure. Do not use general scripting as the shortcut.

## Merge-readiness rule

PR #3 should be judged as the creator-runtime foundation, not as “Bus Escape works.” Before calling it ready:

- current full tests/checks pass in a real checkout;
- no unresolved review threads remain;
- PR description/docs reflect actual branch state;
- no hosted CI was enabled;
- versioned transport/publication remains shared;
- no creator-controlled host authority slipped into any runtime tier;
- deterministic/KMP semantics are explicit for replay-visible behavior.
