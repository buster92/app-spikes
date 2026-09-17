# Playloop creator publishing pipeline v0

This document turns the GameSpec sandbox into a concrete creator → review → publish flow. It is intentionally platform-neutral so the same gates can later run in a Kotlin Multiplatform service/runtime implementation.

## Principle

A creator submission is untrusted data until it has passed every publication gate. The client should eventually execute only a supported runtime version plus a normalized GameSpec/asset set referenced by a publication manifest produced by Playloop.

Creator/AI output is **never** executable JavaScript, WebAssembly, Android bytecode, iOS code, shell code, or arbitrary network configuration.

## Pipeline

```text
AI / creator draft
      │
      ▼
1. GameSpec schema + hard-budget validation
      │
      ▼
2. Publication-policy validation
   - reject unknown fields
   - resolve timer/template/entity/audio references
   - constrain semantic event payloads
      │
      ▼
3. Asset normalization / moderation
   - decode/transcode
   - strip metadata
   - media/policy scanning
   - hash normalized bytes
      │
      ▼
4. Deterministic runtime probes
   - multiple seeds
   - generated pointer/tap input
   - crash detection
   - entity/operation peaks
      │
      ▼
5. Targeted playability bot + preview capture
      │
      ▼
6. Canonicalize GameSpec + hash
      │
      ▼
7. Sign publication manifest (backend later)
      │
      ▼
8. Public / recommendation eligible
```

The current repository implements gates 1, 2, a runtime-safety form of gate 4, canonical transport planning for gate 6, and the web execution side of gate 8. Asset moderation, signing and a real playability bot remain backend/product work.

## Implemented modules

- `src/sandbox/game-spec.js` — basic schema/budget validation and instant-tier profile.
- `src/sandbox/publication-policy.js` — stricter publication semantics. It rejects unknown fields and broken references even when they would merely be ignored by the interpreter.
- `src/sandbox/runtime-core.js` — deterministic DOM-free interpreter.
- `src/sandbox/review.js` — multi-seed runtime probe with per-run event/effect counts, peak entity count, peak interpreted operations and crash capture.
- `src/sandbox/review-cli.mjs` — machine-readable CLI review output for future CI/backend use.
- `src/sandbox/transport.js` — canonical JSON, feed-descriptor sizing, first-play byte planning, cache savings and SHA-256 publication references.
- `src/sandbox/web-canvas-host.js` — browser adapter; static games are event-driven rather than running an unnecessary 60 FPS loop, and page backgrounding suspends game time.

## Review is split into safety and playability

The current automated probe is deliberately called a **runtime safety probe**, not a proof that the game is fun or beatable.

It asks questions such as:

- Does the spec validate?
- Does it obey the publication field/reference policy?
- Does it crash on deterministic seeds?
- Does entity growth remain bounded?
- Does interpreted work remain below the runtime budget?
- Do generated input sequences reveal runtime failures?

A game that remains running after the generic probe can still pass with a warning. Later, genre-aware/AI playability bots can attempt goals, detect impossible states and estimate difficulty without weakening the security boundary.

Run the current probe with:

```bash
npm run review:example
```

The CLI returns JSON and exits non-zero for rejection, so the same contract can later sit behind `publish_for_review` in an AI plugin/MCP/API.

## Lightweight post contract

The social-feed record should not contain the full game package.

A feed item needs only a tiny descriptor similar to:

```json
{
  "kind": "playable",
  "gameId": "tap-bloom",
  "title": "Tap Bloom",
  "runtime": "playloop-2d-v0",
  "specBytes": 974,
  "assetBytes": 0,
  "assetCount": 0,
  "instantEligible": true
}
```

Production will also carry signed/content-addressed references, creator/post IDs and preview-media metadata. The GameSpec body is lazy-fetched only when the post is likely to be played; assets are fetched by hash and cached/deduplicated across posts.

In the current zero-asset examples, measured uncompressed planning output is approximately:

| Example | Feed descriptor | First-play GameSpec/assets |
| --- | ---: | ---: |
| Meteor Dodge | 163 B | 1,558 B |
| Tap Bloom | 156 B | 974 B |

These figures are the GameSpec transport plan only; they do not include HTTP headers, social metadata or optional preview video. Transport compression can make repetitive JSON smaller still.

The important architectural point is that scrolling past a playable post should cost roughly normal social-feed metadata/preview traffic, **not** the full game download.

## Assets without making every post heavy

Assets remain content-addressed:

```text
sha256:<normalized asset bytes>
```

That allows three useful behaviors:

1. Two games using the same asset do not require duplicate storage or download.
2. Popular/shared assets can already be in the device cache before a game is opened.
3. The server can accurately calculate worst-case first-play bytes before publishing.

The instant tier currently declares at most 256 KB of assets and 300 KB combined package weight. That is a ceiling, not a target. Shape/text games can remain around 1–3 KB. Creator-generated images should later be resized/transcoded into small sprite sheets/atlases rather than shipping arbitrary original media.

Preview video is a separate social-media concern. A post may contain video + game, but the video should stream through the normal media pipeline and must not force the playable package to load simultaneously.

## Runtime resource policy

The web host now reflects the intended native policy:

- moving/tick-driven games receive frame stepping;
- static puzzles wake for input or the next timer rather than burning frames continuously;
- hidden/background pages suspend game time;
- only the visible playable should own an active simulation;
- the next playable may prefetch its small manifest/spec/assets according to network/power policy;
- other feed items remain metadata only.

The KMP client should implement the same lifecycle through a platform `Clock/Renderer/Input/AssetResolver` adapter while keeping the state/rules engine in `commonMain`.

## Publication manifest direction

`transport.js` can already canonicalize a valid GameSpec and compute its SHA-256 reference. The eventual backend manifest should add server identity/signature information, for example:

```json
{
  "manifestVersion": 1,
  "runtime": "playloop-2d-v0",
  "gameId": "tap-bloom",
  "specRef": "sha256:...",
  "specBytes": 974,
  "assets": [],
  "instantEligible": true,
  "reviewRevision": 12,
  "signature": "..."
}
```

The client should verify the manifest/runtime/hash before execution. The exact signature scheme is intentionally deferred until there is a backend; the sandbox does not pretend that an unsigned browser draft is a trusted public game.
