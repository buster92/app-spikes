# Playloop sandbox continuation handoff

This file exists so a fresh ChatGPT conversation can continue the current Playloop creator-runtime work without relying on chat history.

**Important:** repository state can move after this file is written. At the beginning of a new session, re-fetch PR #3 and the head branch before editing anything. Treat this file as context and intent, not as a substitute for reading the current code.

## Repository / branch / PR

- Repository: `buster92/app-spikes`
- Current sandbox branch: `feature/gamespec-sandbox-v0`
- Pull request: **#3 — Add portable GameSpec sandbox v0**
- PR URL: `https://github.com/buster92/app-spikes/pull/3`
- Base branch: `main`
- Known head when this handoff was written: `bdef832cee681f2ef02458322e79b0ca3ed57934`
- PR was open and mergeable when this handoff was written.
- Do **not** work directly on `main` for this milestone.

The PR is intentionally large because it establishes the creator-platform boundary, not just one UI feature. Do not merge it merely because one experimental runtime version works. Finish integration, review the complete diff, and make verification status explicit first.

## Product direction / north star

Playloop started as a swipeable feed of tiny handcrafted games. The product direction has now evolved into a **social platform for playable posts**.

A creator/influencer should eventually be able to:

1. ask an AI to create a small game;
2. preview and tweak it;
3. submit it to automated review/moderation;
4. publish a post that can contain video + an instantly playable game;
5. let followers play, like, comment, challenge, remix, follow, and eventually tip/donate.

The runtime is the foundation that lets this scale. The goal is Minecraft/mod-like creative breadth **without** allowing arbitrary untrusted code in each post.

The app is expected to migrate toward **Kotlin Multiplatform** for the production mobile experience. The architecture should therefore keep game logic portable and platform-neutral now, while the current web implementation acts as the reference runtime and fast experimentation surface.

## Non-negotiable architecture rules

Creator content is **data, not application code**.

Do not solve expressiveness problems by allowing arbitrary JavaScript, WASM, native binaries, Lua, eval-like code, arbitrary browser APIs, or arbitrary remote URLs.

A creator GameSpec must not directly receive:

- network access;
- DOM access;
- filesystem access;
- account/session tokens;
- storage/database handles;
- social graph APIs;
- payment/tip APIs;
- raw device identity;
- unrestricted camera/microphone/sensors.

Those belong to the trusted Playloop shell/backend. Future device capabilities can be explicitly capability-gated if there is a strong product reason.

The runtime should remain:

- bounded;
- deterministic enough for automated review and JS↔KMP logical parity;
- suspendable when off-screen;
- inspectable by publication tooling;
- lightweight enough for feed delivery;
- versioned so old games retain semantics.

## Lightweight post / resource goals

Current instant-tier design targets are roughly:

- GameSpec <= **16 KB**;
- declared assets <= **256 KB**;
- combined first-play package <= **300 KB** for instant eligibility;
- normalized image <= **96 KB compressed**;
- decoded raster <= **4 MB per image**;
- decoded creator-image working set <= **8 MB**;
- content-addressed SHA-256 assets;
- no arbitrary creator asset URLs;
- feed post descriptor should remain only hundreds of bytes;
- scrolling the feed must not download every playable package;
- only the visible game should be active;
- at most one next game should be bounded-prefetched;
- static/puzzle games should not run a permanent 60 FPS loop while idle;
- off-screen/background runtimes should consume effectively no simulation/audio resources.

The current asset path already uses reviewed same-origin mappings, SHA-256 verification, metadata checks, sprite atlases, memory reservations, and residency/eviction controls.

## KMP target architecture

The intended production split is:

```text
Playloop mobile shell
  feed / video / profile / comments / likes / notifications / payments / uploads
                  |
                  v
        Playloop runtime commonMain
  GameSpec model / validation / seeded RNG / rules / state / replay
                  |
        platform host adapters
  renderer / input / audio / haptics / asset resolver / clock
```

Read `KMP-RUNTIME-CONTRACT-V0.md` before making changes that would leak browser-specific semantics into the logical runtime.

The common runtime must not depend on Compose, Android Views, UIKit, DOM, filesystem paths or HTTP clients.

Cross-platform parity goal is **equivalent logical snapshots/results**, not pixel-identical rendering.

## Important directories / files

Start with these:

### Architecture / contracts

- `playable-feed/sandbox/README.md`
- `playable-feed/sandbox/GAMESPEC-V0.md`
- `playable-feed/sandbox/GAMESPEC-V1-DRAFT.md`
- `playable-feed/sandbox/GAMESPEC-V2-DRAFT.md`
- `playable-feed/sandbox/EXPRESSIVENESS-ROADMAP.md`
- `playable-feed/sandbox/CREATOR-PRESSURE-V0.md`
- `playable-feed/sandbox/ASSET-PIPELINE-V0.md`
- `playable-feed/sandbox/PUBLISHING-PIPELINE-V0.md`
- `playable-feed/sandbox/KMP-RUNTIME-CONTRACT-V0.md`
- `playable-feed/sandbox/REPLAY-CONTRACT-V0.md`
- `playable-feed/sandbox/AI-CREATOR-TOOLS-V0.md`
- `playable-feed/sandbox/ai-tools-v0.json`
- `playable-feed/sandbox/ai-tools-v1-draft.json`
- `playable-feed/sandbox/ai-tools-v2-draft.json`

### Runtime / validation

- `playable-feed/src/sandbox/game-spec.js` — v0 validator/profile and hard limits
- `playable-feed/src/sandbox/runtime-core.js` — deterministic logical base runtime
- `playable-feed/src/sandbox/safe-runtime.js` — safety/effect/runtime ceilings
- `playable-feed/src/sandbox/game-spec-v1.js`
- `playable-feed/src/sandbox/runtime-v1.js`
- `playable-feed/src/sandbox/game-spec-v2.js`
- `playable-feed/src/sandbox/runtime-v2.js`
- `playable-feed/src/sandbox/game-spec-v3.js`
- `playable-feed/src/sandbox/runtime-v3.js`
- `playable-feed/src/sandbox/publication-policy.js`
- `playable-feed/src/sandbox/review-engine.js`
- versioned `review*.js`, `replay*.js`, and CLI adapters

### Delivery / assets / creator tools

- `playable-feed/src/sandbox/transport.js`
- `playable-feed/src/sandbox/asset-contract.js`
- `playable-feed/src/sandbox/trusted-asset-loader.js`
- `playable-feed/src/sandbox/asset-residency.js`
- `playable-feed/src/sandbox/demo-asset-catalog.js`
- `playable-feed/src/sandbox/web-canvas-host.js`
- `playable-feed/src/sandbox/creator-tools.js`
- `playable-feed/src/sandbox/creator-cli.mjs`
- `playable-feed/src/sandbox/creator-lab.js`
- `playable-feed/creator-lab.html`

### Examples / replay fixtures

Important examples include:

- `examples/meteor-dodge.game.json`
- `examples/tap-bloom.game.json`
- `examples/space-dodge.game.json`
- `examples/creator-star-catch.game.json`
- `examples/whack-orb.game.json`
- `examples/pocket-shooter-v1.game.json`
- `examples/garden-catch-v1.game.json`
- `examples/pattern-echo-v2.game.json`
- `examples/bus-escape-v3.game.json`

There are corresponding replay fixtures under `examples/replays/` for several runtime versions.

## Runtime ladder as currently intended

### `playloop-2d-v0`

Stable foundation / reference contract:

- circles, rectangles, text, sprites;
- sprite atlas source rectangles;
- movement/velocity;
- bounds handling;
- pointer/tap input;
- timers;
- collisions;
- scalar globals;
- conditions and bounded math;
- spawn/destroy;
- semantic events;
- sound/haptic host requests;
- complete/fail;
- seeded randomness;
- hard operation/entity/time budgets.

### `playloop-2d-v1` — experimental

Adds:

- bounded entity reads (`x`, `y`, velocity, dimensions, rotation, opacity, etc.);
- entity-local scalar state;
- `setEntityState` / `addEntityState`;
- max **8 scalar state keys per entity**.

Reference example: `Pocket Shooter v1` and visually distinct `Garden Catch v1`.

This was added because repeated creator-pressure showed simple shooters, richer enemies/items, and stateful objects were awkward in v0.

### `playloop-2d-v2` — experimental

Adds bounded scalar collections for:

- memory sequences;
- queues;
- hands;
- small ordered sets of scalar state.

Current limits:

- max **8 collections**;
- max **16 scalar items per collection**;
- deterministic shuffle;
- reads like `length`, `at`, `first`, `last`;
- bounded mutation actions such as push/set/remove/clear/shuffle.

Reference example: `Pattern Echo v2`.

This exists because sequence/queue/card-like creator pressure repeated; it should not become an excuse for general-purpose dynamic containers.

### `playloop-2d-v3` — experimental and CURRENTLY INCOMPLETE INTEGRATION

The intent is a bounded grid/occupancy layer for games such as:

- Bus Escape / traffic puzzles;
- Match-like board mechanics;
- block/grid puzzles.

Current implementation already contains `game-spec-v3.js`, `runtime-v3.js`, and `bus-escape-v3.game.json`.

The design includes concepts such as:

- bounded grids (max 64 cells intended);
- entities attached to grid coordinates/spans;
- cell occupancy checks;
- `canMoveBy`;
- `pathClearToEdge`;
- deterministic grid movement;
- composition with v1 entity state and v2 collections.

`Bus Escape v3` currently combines:

- directional buses on a grid;
- bus color/direction in entity-local state;
- passenger queue as a v2 collection;
- parking queue as a v2 collection;
- `pathClearToEdge` before a bus can leave;
- generic GameSpec rules rather than special-purpose Bus Jam JavaScript.

This is the architectural milestone to finish next.

## Current integration gap / likely first bug to fix

At handoff time, `creator-tools.js` already recognizes `playloop-2d-v3`, but **`transport.js` only has adapters for v0, v1 and v2**.

That means a valid v3 spec can pass the v3 profile/publication adapter in `validateForAuthoring()`, then fail when creator tooling calls `buildTransportPlan(spec)` because transport does not yet recognize v3.

This should be one of the first fixes in the next session.

Do not paper over this by bypassing transport for v3. Add the same versioned adapter properly so feed descriptor / manifest / byte accounting remain shared across runtime versions.

## Other v3 work that was intentionally left unfinished

Before calling v3 integrated, check and complete all of these:

1. **Transport**
   - add v3 profile/publication adapter to `transport.js`;
   - ensure deterministic publication envelope/manifest works;
   - keep feed descriptor small.

2. **Creator Lab**
   - add `Bus Escape v3` to the example picker;
   - choose `SafeSandboxRuntimeV3` when runtime id is v3;
   - validate/simulate/run v3 through the same trusted path;
   - do not add any creator-code execution shortcut.

3. **Creator CLI / package scripts**
   - add capabilities/validate/simulate/manifest/review/replay commands for v3;
   - update `npm run check` to syntax-check every new v3 module/CLI;
   - preserve the JSON-oriented interface expected by future MCP/API tooling.

4. **AI-facing contract**
   - write `GAMESPEC-V3-DRAFT.md`;
   - add `ai-tools-v3-draft.json` or equivalent transport-neutral contract;
   - document grid limits and complexity explicitly;
   - explain that grid APIs are high-level bounded primitives, not arbitrary pathfinding/loops.

5. **Sandbox README / roadmap**
   - add v3 to the runtime ladder;
   - explain which creator-pressure problem it solves;
   - keep the next capability evidence-driven.

6. **Tests**
   - validate v3 schema/policy/profile;
   - runtime occupancy/path semantics;
   - blocked and clear bus paths;
   - invalid overlapping/out-of-bounds initial placements;
   - v3 deterministic replay;
   - creator-tools capabilities and diagnostics;
   - transport envelope / instant-tier accounting;
   - Creator Lab/runtime dispatch where practical;
   - automated review through the v3 adapter.

7. **Security / complexity review**
   - verify no grid operation can become unbounded with creator-controlled board sizes;
   - verify operations contribute appropriately to runtime operation budgets;
   - reject invalid spans/placements at publication time rather than relying only on runtime failure;
   - make initial occupancy deterministic and reject overlapping starting placements;
   - make event-scoped entity refs obey the same availability rules as earlier runtimes.

8. **KMP contract**
   - add `GridSpec` / `GridPlacement` commonMain mapping;
   - specify exact occupancy/path semantics and iteration order;
   - add v3 golden replay fixture expectations for JS↔Kotlin parity.

## Quality bar for continuing this work

Do not optimize for number of commits or features. Optimize for a small runtime language that is safe, portable, predictable, lightweight and surprisingly expressive.

For each new primitive, explicitly answer:

1. bounded worst-case CPU cost?
2. bounded memory cost?
3. statically reviewable?
4. deterministically testable?
5. portable to KMP with equivalent semantics?
6. fully suspendable off-screen?
7. no implicit network/device/account authority?
8. does it materially expand the creator design space instead of just making one example easier?

When a desired game is awkward, first ask whether the pain repeats across several genres. Prefer high-level reviewed components with known complexity over general scripting.

Examples:

- collections were justified by memory sequences / queues / hands;
- grid occupancy is justified by traffic / match / block puzzles;
- animation/tweens will likely be justified for comprehension/polish and can remain declarative;
- arbitrary physics should remain a later, explicitly reviewed capability tier rather than being casually added to the instant runtime.

## Asset / visual diversity direction

A major product concern is visual sameness. The runtime cannot become a set of obvious reskins.

Current solution direction:

- creators/AI request or upload assets;
- backend normalizes/resizes/moderates them;
- public media receives SHA-256 refs;
- sprites and atlases reference those reviewed hashes;
- assets remain small and cacheable across many games;
- GameSpec never contains arbitrary URLs;
- runtime logic remains independent from visual style.

This lets one game look like pixel space, another like a garden/frog game, another like an influencer-branded challenge, while all execute through the same interpreter.

Do not conflate visual freedom with arbitrary code freedom.

## Social/platform scope: important but NOT next implementation priority

The long-term product needs followers, likes, comments, creator profiles, shares, challenges, remixing and possible tips/donations.

However, those should remain in the shell/backend and should not distract from the current runtime milestone.

The next foundational question is still:

> Can an external AI create genuinely varied, novel, lightweight games that the Playloop runtime did not know about when the app shipped, while Playloop can safely validate/review/run them?

The creator-runtime work should prove that before building the full social network.

## Existing consumer spike context

The original playable-feed PWA has ~16 handcrafted games and prior playtest improvements. It demonstrated that the `play → swipe` loop can be fun, but the user observed fatigue after ~15 minutes because the games continuously demand attention/speed.

That observation led to the larger platform direction: posts can mix passive video/social content and playable experiences. A creator might stream or post a video about a game, and followers can immediately play the attached experience.

Do not spend the next sandbox session polishing the old handcrafted mini-games unless a runtime/platform need depends on it.

## Verification policy

**GitHub Actions are intentionally not being used for this spike** because the user does not want to spend hosted CI quota on it.

Rules for future assistant work:

- Do not add/enable hosted CI unless the user explicitly changes this decision.
- Do not claim `npm test` or `npm run check` passed unless they were actually executed in an available runtime.
- If only code inspection/tests were written but not executed, say that explicitly.
- Earlier stages had confirmed local/isolated tests, but the complete newest v1/v2/v3-expanded suite has **not** been verified through hosted CI.
- Before merge, ideally execute `npm test` and `npm run check` locally if the environment allows it.

## GitHub editing workflow / practical notes

Use the GitHub connector directly for this repository.

When updating an existing file:

1. fetch the latest file on `feature/gamespec-sandbox-v0`;
2. use its current SHA;
3. update sequentially.

There have been several `409` stale-SHA conflicts during long sessions because the same files were modified repeatedly. A 409 normally means the branch moved or the blob SHA is stale; re-fetch before retrying rather than guessing.

Prefer coherent commits and keep the current branch/PR. Do not create another branch just because the chat changed unless there is a specific architectural reason.

After substantial work:

- re-fetch PR #3;
- update the PR body so it accurately reflects the actual runtime ladder and verification status;
- inspect mergeability;
- inspect the whole changed-file set/diff for accidental files, stale docs and inconsistent claims.

## Recommended next-session sequence

Use this order rather than immediately adding another capability:

```text
1. Re-fetch PR #3 + branch head
2. Read this handoff + sandbox README + v3 files
3. Finish v3 transport / lab / CLI / docs / AI contract integration
4. Harden v3 validator/runtime edge cases
5. Complete v3 tests + replay/review adapters
6. Run local checks/tests if execution is available
7. Review complete PR #3 diff for correctness/duplication/stale claims
8. Update PR #3 body accurately
9. Only then decide whether v3 is ready to keep or needs simplification
10. Next capability only after this milestone is coherent
```

Likely next capability after v3, if creator pressure still supports it, is **declarative animation/tweens/particles** for comprehension and visual polish. Do not jump to that until v3 is integrated and reviewed.

## Definition of success for this milestone

PR #3 should leave us with a convincing proof that:

- games arrive as data, not code;
- multiple visually/mechanically distinct games run through the same engine;
- creators/AIs can target a documented API/contract;
- richer state/sequence/grid mechanics can be added through bounded versioned primitives;
- assets stay reviewed/content-addressed/lightweight;
- public feed metadata stays tiny;
- automated review can reason about runtime behavior;
- deterministic replays make future JS↔KMP parity testable;
- no experimental version silently changes v0 semantics;
- native migration can preserve the same security boundary.

That is more important than maximizing the number of supported genres right now.
