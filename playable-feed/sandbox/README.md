# Playloop sandbox v0

This directory defines the creator-content boundary for a future Playloop platform.

The current implementation proves that games can be loaded as bounded data rather than being compiled into the app, while keeping a migration path to Kotlin Multiplatform.

## Read in this order

1. [`GAMESPEC-V0.md`](./GAMESPEC-V0.md) — runtime/security model and public GameSpec contract.
2. [`game-spec-v0.schema.json`](./game-spec-v0.schema.json) — machine-readable authoring schema for tools/AIs.
3. [`ASSET-PIPELINE-V0.md`](./ASSET-PIPELINE-V0.md) — normalized media, hashes, atlases, caching and memory/network budgets.
4. [`PUBLISHING-PIPELINE-V0.md`](./PUBLISHING-PIPELINE-V0.md) — draft → automated review → moderation → signed public package.
5. [`KMP-RUNTIME-CONTRACT-V0.md`](./KMP-RUNTIME-CONTRACT-V0.md) — commonMain/platform split and migration invariants.
6. [`REPLAY-CONTRACT-V0.md`](./REPLAY-CONTRACT-V0.md) — deterministic input/snapshot format for JS↔KMP parity and future ghosts/challenges.
7. [`AI-CREATOR-TOOLS-V0.md`](./AI-CREATOR-TOOLS-V0.md) — proposed API/MCP/plugin surface for external AIs.
8. [`ai-tools-v0.json`](./ai-tools-v0.json) — machine-readable transport-neutral tool manifest.
9. [`CREATOR-PRESSURE-V0.md`](./CREATOR-PRESSURE-V0.md) — genre-by-genre pressure test showing what v0 can express and which missing primitives actually repeat.
10. [`EXPRESSIVENESS-ROADMAP.md`](./EXPRESSIVENESS-ROADMAP.md) — bounded path from v0 toward richer creator games without arbitrary scripting.

## Reference implementation

The web reference lives under `../src/sandbox/` and currently includes:

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
- lightweight transport planning;
- deterministic automated review probes;
- structured AI-authoring diagnostics/capabilities;
- deterministic replay traces for future KMP parity;
- a local creator CLI that mirrors the future API/MCP operations for capabilities, validation, simulation and unsigned publication-manifest generation.

## Creator Lab

`../creator-lab.html` is a deliberately small manual authoring workbench for the stage before a real creator backend exists.

It lets a person or external AI:

1. generate or edit GameSpec JSON;
2. paste it into the editor;
3. validate it through the same authoring/publication gates;
4. run deterministic safety simulations;
5. execute it in the trusted Canvas sandbox.

It does not evaluate creator JavaScript and it cannot resolve arbitrary URLs. Sprite games can only run with reviewed assets already present in the host-controlled demo catalog.

This gives us a practical way to test the AI-creation loop before building accounts, remote draft storage, MCP hosting, signing or public publishing.

## Creator CLI

From `playable-feed/`:

```bash
npm run creator:capabilities
npm run creator:validate
npm run creator:simulate
npm run creator:manifest
npm run replay:space
```

The CLI returns JSON so an external AI or local agent can consume the same authoring feedback without needing Playloop source-code access. It does **not** publish, sign content, upload arbitrary code or grant access to player/social/payment APIs.

## Examples

- `meteor-dodge.game.json` — zero-asset continuous dodge mechanic.
- `tap-bloom.game.json` — zero-asset tap/reposition mechanic.
- `space-dodge.game.json` — visually richer version using a background plus a tiny shared sprite atlas.
- `creator-star-catch.game.json` — an AI-authored catch/avoid game expressed only as GameSpec and reused reviewed assets; no game-specific JavaScript was added.
- `whack-orb.game.json` — zero-asset moving-target game, proving a tap/relocation loop on the same runtime.
- `replays/space-dodge-3s.replay.json` — bounded deterministic input trace for runtime parity.

Open `../sandbox-demo.html` through a local HTTP server to switch between the playable examples, or open `../creator-lab.html` to edit/validate/simulate/run GameSpec JSON directly.

## Architectural rule

Creator content is never trusted application code.

```text
GameSpec + reviewed content-addressed assets
                  ↓
         validated runtime core
                  ↓
      host-controlled effects only
```

Likes, follows, comments, challenges, tips, payments, accounts, network access and device capabilities remain owned by the Playloop shell/backend rather than by creator games.
