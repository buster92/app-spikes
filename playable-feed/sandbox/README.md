# Playloop sandbox v0

This directory defines the creator-content boundary for a future Playloop platform.

The current implementation proves that games can be loaded as bounded data rather than being compiled into the app, while keeping a migration path to Kotlin Multiplatform.

## Read in this order

1. [`GAMESPEC-V0.md`](./GAMESPEC-V0.md) — runtime/security model and public GameSpec contract.
2. [`game-spec-v0.schema.json`](./game-spec-v0.schema.json) — machine-readable authoring schema for tools/AIs.
3. [`ASSET-PIPELINE-V0.md`](./ASSET-PIPELINE-V0.md) — normalized media, hashes, atlases, caching and memory/network budgets.
4. [`PUBLISHING-PIPELINE-V0.md`](./PUBLISHING-PIPELINE-V0.md) — draft → automated review → moderation → signed public package.
5. [`KMP-RUNTIME-CONTRACT-V0.md`](./KMP-RUNTIME-CONTRACT-V0.md) — commonMain/platform split and migration invariants.
6. [`AI-CREATOR-TOOLS-V0.md`](./AI-CREATOR-TOOLS-V0.md) — proposed API/MCP/plugin surface for external AIs.
7. [`ai-tools-v0.json`](./ai-tools-v0.json) — machine-readable transport-neutral tool manifest.

## Reference implementation

The web reference lives under `../src/sandbox/` and currently includes:

- bounded GameSpec validation;
- publication-policy validation;
- deterministic DOM-free runtime core;
- safety wrapper and runtime ceilings;
- Canvas renderer/input host;
- SHA-256 verified trusted image loading;
- sprite and sprite-atlas rendering;
- decoded-image memory budgets;
- visible+next asset residency/eviction policy;
- lightweight transport planning;
- deterministic automated review probes;
- structured AI-authoring diagnostics/capabilities;
- a local creator CLI that mirrors the future API/MCP operations for capabilities, validation, simulation and unsigned publication-manifest generation.

## Creator CLI

From `playable-feed/`:

```bash
npm run creator:capabilities
npm run creator:validate
npm run creator:simulate
npm run creator:manifest
```

The CLI returns JSON so an external AI or local agent can consume the same authoring feedback without needing Playloop source-code access. It does **not** publish, sign content, upload arbitrary code or grant access to player/social/payment APIs.

## Examples

- `meteor-dodge.game.json` — zero-asset continuous dodge mechanic.
- `tap-bloom.game.json` — zero-asset tap/reposition mechanic.
- `space-dodge.game.json` — visually richer version using a background plus a tiny shared sprite atlas.
- `creator-star-catch.game.json` — an AI-authored catch/avoid game expressed only as GameSpec and reused reviewed assets; no game-specific JavaScript was added.

Open `../sandbox-demo.html` through a local HTTP server to switch between them.

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
