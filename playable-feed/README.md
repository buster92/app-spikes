# Playable Feed Spike — v0

A fast product experiment for one question:

> After finishing or failing one tiny game, will a person voluntarily swipe into another, and keep doing it?

This is intentionally a **behavior-validation prototype**, not a game platform. It uses one active game surface at a time, so it stays lightweight while still feeling like an infinite feed.

## What is implemented

- 11 distinct microgame mechanics:
  - Tap Rush
  - Perfect Stop
  - Bigger Wins
  - Green Light
  - Symbol Hunt
  - Flash Memory
  - Swipe Call
  - Lane Dodge
  - Quick Count
  - Hold Steady
  - Odd One
- Infinite feed behavior. A complete cycle uses each mechanic once before repeating.
- Procedural variants across cycles: palette, difficulty, target positions, timings, counts, sequences, layouts and game-specific parameters.
- Lightweight adaptive difficulty from 1–5 based on recent outcomes.
- XP/streak feedback, micro-animation, optional sound and supported-device haptics.
- Skip by swiping upward at any time; retry/next after an outcome.
- Strong local analytics with JSON export.
- Installable/offline-capable PWA shell.
- Zero runtime dependencies and zero accounts/backend required for the spike.

## Analytics captured

The prototype stores bounded events in `localStorage` and exposes an in-app analytics sheet. Events include:

- `session_start` / `session_end`
- `game_impression`
- `game_first_interaction` with time-to-first-action
- categorized `game_interaction`
- `game_complete` / `game_fail`
- `game_skip` including whether the user interacted first
- `game_retry`
- `feed_swipe` / `feed_advance`
- `feed_cycle_completed`
- `difficulty_changed`
- visibility/background transitions

Every game event includes game/variant identifiers and timing where relevant. Use **Export JSON** from the app after a playtest.

### Metrics that matter first

Do not optimize revenue, accounts, recommendations, multiplayer, creator tooling or backend infrastructure yet. First inspect:

1. games seen per session
2. fraction reaching game 3 / 5 / 10 / 20
3. immediate-skip rate by mechanic
4. retry rate
5. completion/failure distribution
6. active seconds per game
7. time to first interaction
8. whether people naturally begin another session later

If people consistently stop after one or two games, adding dozens more games is not the right response. The feed loop itself needs to earn expansion.

## Run locally

ES modules need an HTTP origin rather than opening `index.html` directly.

```bash
cd playable-feed
python3 -m http.server 8080
```

Then open `http://localhost:8080` on desktop or from a phone on the same network using the computer's LAN IP.

For JavaScript checks/tests:

```bash
cd playable-feed
npm test
npm run check
```

No `npm install` is needed.

## Suggested next validation step

Put this exact build in front of 5–10 people without explaining the mechanics. Give only one instruction: **"Use this for a few minutes and stop whenever you want."** Export each session's JSON. The main evidence is where they stop, what they skip, what they replay, and whether the next-game action becomes automatic.

Only after the feed loop shows signal should the spike expand toward 20+ mechanics, remote analytics, recommendation/personalization and downloadable HTML5 playable content.
