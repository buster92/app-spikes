# Playloop creator asset pipeline v0

Creator games need visual freedom without turning every post into a heavy download or allowing untrusted media to bypass moderation. The rule is simple:

> Uploaded or AI-generated media is never executed or referenced directly by a public GameSpec. It is normalized, reviewed, content-addressed, then resolved by the Playloop host.

## Draft → public asset flow

```text
creator / AI
    │
    ├── upload image/audio
    └── generate image/audio
            │
            ▼
      temporary draft blob
            │
            ├── decode with hardened media service
            ├── reject malformed/polyglot data
            ├── strip metadata
            ├── resize / crop / transcode
            ├── content moderation
            ├── copyright / abuse checks as required
            ├── calculate normalized byte + decoded budgets
            └── SHA-256 normalized output
                       │
                       ▼
             trusted asset storage
                       │
                       ▼
        sha256:… + reviewed metadata
                       │
                       ▼
                  GameSpec
```

The public client never needs the original creator upload.

## Why normalize before hashing

Hashing the raw upload would produce duplicate assets for trivial metadata/encoding differences and would keep unsafe/unnecessary bytes around.

Instead, Playloop hashes the **normalized output**. For example:

```text
creator PNG/JPEG/HEIC
      ↓
decode pixels
      ↓
strip EXIF/ICC unless intentionally retained
      ↓
resize within tier budget
      ↓
encode approved WebP/AVIF/PNG profile
      ↓
moderate normalized pixels
      ↓
SHA-256
```

Two creators using the same normalized visual can therefore share one cached object.

## Public asset metadata

GameSpec v0 only needs bounded metadata:

```json
{
  "id": "frog-atlas",
  "kind": "image",
  "ref": "sha256:…",
  "bytes": 18243,
  "mime": "image/webp",
  "width": 512,
  "height": 256
}
```

No public asset entry contains:

- arbitrary remote URL;
- upload token;
- filesystem path;
- creator cloud credential;
- script payload;
- embedded HTML/SVG runtime behavior.

## v0 instant-media budgets

The current web reference contract uses intentionally conservative limits:

- total declared asset bytes: **256 KB**;
- single normalized image: **96 KB** compressed;
- single normalized audio asset: **128 KB** compressed;
- raster dimensions: **1024×1024 max per axis**;
- decoded image working set: **4 MB max per image**;
- decoded image working set: **8 MB max per active/prefetched set**.

These are feed-safety budgets, not claims about the final production limits. A future `rich` tier can be larger, but should never silently run under `instant` expectations.

## Atlases first

For small games, sprite atlases are usually more efficient than many separate files.

Example:

```text
space-atlas.webp
  [ ship 64×64 ][ meteor 64×64 ][ shield 64×64 ][ coin 64×64 ]
```

GameSpec entities reference the same image plus source rectangles. Benefits:

- one HTTP/cache object;
- one SHA-256 verification;
- one decoded bitmap;
- less metadata overhead;
- better cross-post reuse if the atlas belongs to a shared creator/style pack.

The current `Space Dodge` reference game already uses atlas source rectangles.

## Shared packs vs per-post assets

A creator post should be able to use three sources of visual content:

1. **Playloop system packs** — common UI, particles, generic shapes, sound cues. Usually already cached.
2. **Creator packs** — an influencer's recurring avatar/style/brand sprites reused across many posts.
3. **Post-specific assets** — only the unique pieces required for this game.

The feed descriptor counts declared bytes, while the client transport plan also calculates **uncached** bytes. A creator who reuses a pack can therefore publish visually distinct games without repeatedly paying the full transfer cost.

## Feed loading policy

Scrolling a post does not imply downloading the game assets.

Recommended sequence:

```text
feed card enters recommendation list
  -> metadata + preview only

card approaches viewport
  -> optionally fetch small GameSpec

card becomes next likely playable
  -> prefetch bounded referenced assets

card becomes visible / user taps Play
  -> activate runtime

card moves away
  -> stop runtime
  -> release decoded assets unless shared with visible/next card
```

The web reference implementation now has an asset-residency controller that keeps only the visible game plus at most one prefetched game's referenced images resident. Native KMP should use the same policy conceptually and become stricter under memory pressure.

## Runtime verification

Even reviewed storage should not be trusted blindly by the client. Before decoding, the host verifies:

- asset is present in the host-controlled catalog/manifest;
- kind matches;
- compressed byte size matches;
- MIME matches;
- declared dimensions match catalog metadata;
- fetched bytes hash to the declared SHA-256.

After decoding, the host verifies actual raster dimensions again before exposing the bitmap to the renderer.

This protects against stale/misconfigured CDN entries as well as malicious draft data.

## Moderation boundary

The sandbox validator can verify shape, references and resource budgets. It cannot decide whether an image is abusive, copyrighted, impersonating someone, sexual, violent, etc.

Media moderation belongs in the publishing service before a hash becomes public. The publication manifest should store moderation/review status and version so a later policy change can invalidate or re-review an asset without changing the runtime engine.

## Generated media

AI-generated assets follow exactly the same pipeline as uploaded assets. The model/provider URL is draft-only metadata; the public game sees only the normalized reviewed hash.

A creator flow could therefore be:

```text
"make my character a purple robot"
       ↓
AI image generation
       ↓
normalize / moderate / hash
       ↓
creator preview
       ↓
GameSpec references trusted hash
```

The game-generation AI never needs permission to execute code or contact arbitrary URLs from the player device.

## Audio

Audio should use the same content-addressed model. v0 permits metadata for normalized audio, but the current web demo focuses on raster images first.

Production normalization should bound:

- duration;
- sample rate;
- channels;
- decoded PCM memory;
- loudness/peak levels;
- number of simultaneous voices.

The runtime's `sound` action is only a host request. The app can suppress sound under mute, background, accessibility, battery or abuse policy.

## Future animation formats

Do not solve animation by allowing arbitrary SVG/HTML/Lottie scripts from creators.

Safer evolution paths include:

- sprite-sheet frame sequences;
- declarative animation tracks;
- bounded particle emitters;
- tile maps;
- approved vector path subset;
- later skeletal animation with explicit bone/vertex budgets.

Each becomes a versioned GameSpec capability with measurable CPU/GPU/memory cost.

## Metrics worth collecting

For real users, the host should measure:

- spec bytes fetched;
- cold asset bytes fetched;
- cache-hit bytes saved;
- decode time;
- peak decoded creator image bytes;
- time from Play intent to first rendered frame;
- asset validation/hash failures;
- prefetch hit rate;
- assets released under memory pressure.

The product goal is not merely "small files." It is **instant enough that tapping a playable post feels like interacting with the feed, not launching another app**.
