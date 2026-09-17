# Playloop GameSpec v0 — portable sandbox contract

## Goal

GameSpec is the boundary between creator/AI-authored content and the Playloop application. A published game is **data**, not downloaded JavaScript or native code. The web prototype interprets the same concepts that a future Kotlin Multiplatform runtime should implement in `commonMain`.

The design target is broad creative range under explicit, inspectable limits:

- creators can combine entities, movement, timers, state, collisions, input and effects;
- AI can generate the format from a schema/reference without knowing Android/iOS internals;
- the runtime can validate, simulate and moderate a game before publication;
- a game has no direct DOM, filesystem, cookie, device-id, arbitrary network, eval, worker, WebAssembly or native API access;
- a feed card stays lightweight and the actual playable package is fetched only when it is likely to be played.

## Portable architecture

```text
Creator / AI
    │
    ▼
GameSpec JSON + content-addressed assets
    │
    ├── schema / policy validation
    ├── resource-budget validation
    ├── moderation + asset scanning
    ├── deterministic bot/simulation runs
    └── signed publication manifest
              │
              ▼
        Playloop Runtime Core
      (pure state + rules engine)
          │             │
          ▼             ▼
      Web Canvas     KMP adapters
                     Android / iOS
```

The runtime core owns state transitions. Rendering, pointer input, sound and haptics are adapters. This keeps the GameSpec portable.

## Game package

A logical package looks like this:

```text
manifest.json          ~1 KB
main.game.json         typically 2–12 KB
assets/*               optional, content-addressed
```

The feed itself should not embed the package. A social post carries only metadata and preview media. The GameSpec is lazy-fetched on intent (tap, dwell, or next-card prefetch policy). Assets are fetched by hash from Playloop-controlled storage and can be deduplicated across many games.

### Instant tier v0

Hard limits in the prototype:

- GameSpec JSON: **16 KB max** before transport compression
- declared assets: **256 KB max** total
- combined declared package: **300 KB max** for `instantEligible`
- starting/runtime entities: **64 max**
- templates: **24 max**
- rules: **96 max**
- actions per rule: **16 max**
- timers: **16 max**
- runtime duration represented by timers: **60 s max**
- operation budget: **2,000 interpreted operations per simulation step**
- simulation step clamp: **50 ms**

Most games should be much smaller. Primitive shapes/text need zero external assets. Shared Playloop asset packs can later provide reusable sprites/audio without duplicating bytes per post.

These are v0 product budgets, not permanent limits. Higher-cost content should be a separate tier that is never silently treated as instant-feed content.

## Security boundary

GameSpec has no arbitrary scripting. The only behavior comes from whitelisted events, expressions and actions.

### Allowed event families

`start`, `tick`, pointer/tap events, timers, collisions and entity-exit events.

### Allowed expressions

Literals plus a small expression tree:

- `{"var":"score"}`
- `{"event":"x"}`
- `{"random":[0,360]}` using runtime-seeded RNG
- bounded math: `add`, `sub`, `mul`, `div`, `min`, `max`

There are no loops, function declarations, reflection, dynamic imports or calls into the host app.

### Allowed actions

State and entity mutations, spawn/destroy, controlled effects, conditional action blocks, complete/fail.

Host effects such as sound/haptic are requests. The app may ignore them based on device capability, user settings, accessibility, moderation or power policy.

## Assets

GameSpec never contains a third-party URL. Assets use a trusted content-addressed reference such as:

```json
{
  "id": "frog",
  "kind": "image",
  "ref": "sha256:…",
  "bytes": 18432
}
```

The publishing service owns the hash→CDN mapping. Before publication, assets can be decoded, transcoded, stripped of metadata, scanned and rejected independently of the game rules.

Recommended publishing pipeline later:

1. decode uploaded/generated media;
2. reject malformed/polyglot files;
3. resize/transcode into Playloop formats;
4. strip metadata;
5. content moderation;
6. hash normalized bytes;
7. store in trusted asset storage;
8. rewrite draft references to `sha256:` ids.

## Moderation/review pipeline

A public creator game should pass automated gates before it can enter recommendations:

1. **Schema validation** — known runtime version and well-formed fields.
2. **Static sandbox validation** — only allowed events/actions/expressions and no excessive nesting.
3. **Budget validation** — spec/assets/entities/timers/rules under tier limits.
4. **Asset review** — malware/media safety/policy/copyright workflows as required.
5. **Metadata review** — title, description, tags and creator-supplied text.
6. **Automated simulations** — multiple deterministic seeds and bot inputs, watching for crashes, operation-budget violations, impossible completion paths and pathological entity growth.
7. **Preview capture** — trusted runtime produces the preview frame/clip rather than accepting executable creator preview code.
8. **Signing** — publication service signs the normalized manifest/spec hashes.
9. **Runtime verification** — clients accept only supported runtime versions and published hashes.

Games can still be reported after publication; automated review reduces risk but does not replace abuse reporting or policy enforcement.

## Social/app APIs are outside the sandbox

A game cannot directly:

- follow a user;
- post a comment;
- send a donation/payment;
- read followers;
- call arbitrary backend endpoints;
- identify the device or player.

Instead, it can finish with a result and optionally emit approved semantic events. The Playloop shell decides whether to show **Like**, **Challenge**, **Remix**, **Follow**, **Comment**, **Tip**, etc. This separation prevents creator content from becoming an application-within-the-application with unrestricted privileges.

## KMP migration contract

The JavaScript prototype intentionally separates the runtime from Canvas/DOM. A KMP implementation maps directly:

```text
commonMain
  GameSpec models          kotlinx.serialization
  Validator                same hard limits/opcode whitelist
  RuntimeCore              state/rules/physics/timers/RNG
  RuntimeSnapshot
  HostEffect               sound/haptic/emit/complete/fail

platform adapters
  Renderer                 Canvas/Skia/Metal-backed surface
  Input                    touch/pointer
  Audio                    AVAudio / Android audio
  Haptics                  platform implementation
  AssetResolver            trusted hash -> local cached asset
  Clock                    frame/lifecycle control
```

The core should use a fixed seeded PRNG and deterministic units so automated review, web previews and native execution can reproduce the same scenario closely enough for debugging.

## Runtime lifecycle / resource policy

Only the visible playable owns a running simulation.

```text
previous card     suspended; no timers/frames/audio
current card      runtime active
next card         manifest/spec/assets optionally prefetched
rest of feed      metadata only
```

A puzzle with no animation should render only after state changes. Continuous frame stepping is reserved for games that need it. Backgrounding immediately suspends runtime time, audio and input. Native clients should be able to drop decoded assets under memory pressure and resolve them again from the trusted cache.

## AI creator surface

The first AI-facing contract should expose the schema/reference plus validator feedback, not the Playloop source code. A future API/MCP/plugin can provide narrow operations such as:

- `create_draft_game`
- `validate_game`
- `simulate_game`
- `capture_preview`
- `publish_for_review`
- `remix_game`

An AI can iterate on validation/simulation failures. It never receives a capability to upload arbitrary executable code.

## v0 proof in this repository

`src/sandbox/game-spec.js` validates the bounded format and reports package weight.

`src/sandbox/runtime-core.js` is a DOM-free interpreter with deterministic random, timers, input, movement, collision, bounds behavior and whitelisted actions.

`src/sandbox/web-canvas-host.js` is the web adapter.

`examples/meteor-dodge.game.json` is a zero-asset game. `sandbox-demo.html` loads that JSON at runtime, proving the page can execute a game that was not hand-coded into the app's existing `GAME_DEFINITIONS` registry.

This is intentionally not yet wired into the main feed. The first milestone is to prove the portable sandbox boundary before making feed/navigation semantics depend on creator packages.
