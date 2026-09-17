# Playable Feed Spike

## Validation question

> After finishing or failing one tiny game, will a person voluntarily swipe into another, and keep doing it?

This is a validation spike, not a platform. The first job is to test the behavioral loop `play → swipe → play` before building accounts, backend, recommendations, creator tooling, or monetization.

## Current prototype

Playloop is a mobile-first PWA with a shared polished shell and 16 short mechanics. Each feed cycle uses every mechanic once before reshuffling. Procedural variants change layout, targets, speed, timing, sequences, counts and themes. Difficulty adapts from 1–5 based on recent outcomes.

The current catalog includes reaction, timing, memory, visual search, number choice, directional swipe, lane dodge, multi-hazard dodge, quick counting, hold/tracking, odd-one-out, Jump Rush, Micro Snake, Micro Match, and directional Bus Jam.

The prototype also includes:

- XP and streak reinforcement
- local personal records for best XP, streak, level and longest run
- post-game likes stored locally
- retry/skip/swipe navigation
- one-time progression rewards per feed variant, so retry farming cannot generate unlimited XP
- visible level/record/streak reinforcement
- local behavior analytics with JSON export
- game-specific interaction telemetry plus common completion/failure events
- runtime error capture and renderer fallback
- PWA/offline shell
- no account or backend
- no external runtime dependencies

## First metrics to inspect

- games seen per session
- reach 3 / 5 / 10 / 20
- immediate skips by mechanic
- retry rate
- completion/failure rate
- active seconds per game
- time to first interaction
- likes by mechanic
- repeat sessions

If people consistently stop after 1–2 games, adding dozens more mechanics is not the right response. The core continuation loop needs to change first.

## Run locally

```bash
cd playable-feed
python3 -m http.server 8080
```

Open `http://localhost:8080` or the machine's LAN IP from a phone. Normal LAN HTTP is enough for gameplay testing; PWA install/offline behavior generally needs HTTPS or localhost.

## Local checks

```bash
npm test
npm run check
```

GitHub Actions is intentionally disabled for this spike to avoid spending hosted CI quota. Run checks locally when needed.

## First playtest protocol

Give 5–10 people one instruction only:

> Use this for a few minutes and stop whenever you want.

Do not explain the mechanics unless they are genuinely blocked. Export the JSON afterward and inspect continuation, confusion, skips, retries, failures and likes.

## Product hypotheses discovered during phone playtests

The active microgame feed can be fun for many rounds, but sustained high-attention play also becomes tiring. A longer-term hypothesis is a social feed where the post itself is a playable experience: creators describe/remix games with AI, users can watch a short preview or another run, then choose when to play.

This is documented in [`CREATOR-NETWORK-HYPOTHESIS.md`](./CREATOR-NETWORK-HYPOTHESIS.md). The proposed first implementation is a constrained declarative `GameSpec`, not arbitrary AI-generated JavaScript. That direction should be tested only after the basic feed continues to show repeat-play signal with external users.

## Expansion gate

Only expand toward remote analytics, ranking/personalization, downloadable creator content, global leaderboards, accounts, or publishing infrastructure after the behavioral loop shows signal beyond the builder's own sessions.
