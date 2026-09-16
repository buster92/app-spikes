# Playable Feed Spike — v0

A fast product experiment for one question:

> After finishing or failing one tiny game, will a person voluntarily swipe into another, and keep doing it?

This is intentionally a **behavior-validation prototype**, not a game platform. It uses one active game surface at a time, so it stays lightweight while still feeling like an infinite feed.

## What is implemented

- 15 distinct microgame mechanics:
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
  - Dodge Stream — multiple sequential/overlapping falling hazards
  - Jump Rush — the target moves after every hit and auto-jumps when its countdown ring expires
  - Micro Snake — short 8×8 Snake rounds with touch controls
  - Micro Match — compact 5×5 match-3 rounds with a small clear target and limited moves
- Infinite feed behavior. A complete cycle uses each mechanic once before repeating.
- Procedural variants across cycles: palette, difficulty, target positions, timings, counts, sequences, layouts and game-specific parameters.
- Lightweight adaptive difficulty from 1–5 based on recent outcomes.
- XP/streak feedback, micro-animation, optional sound and supported-device haptics.
- Local personal records for best XP, best streak, highest level and longest run.
- A one-time `NEW BEST` reinforcement when the current run crosses a stored personal record.
- Skip by swiping upward at any time; retry after an outcome.
- Mobile gesture hardening so the browser does not select text, show iOS callouts, scroll, or steal game/feed gestures.
- Background lifecycle handling: an active round is stopped while hidden and the same deterministic variant restarts on return without counting another feed impression or hidden time as active play.
- Strong local analytics with JSON export.
- Renderer/transition error recovery so a broken microgame shows a skippable `ROUND ERROR` instead of stranding the player on a blank feed.
- Installable/offline-capable PWA shell with standard 192/512 Android install icons and an iOS home-screen icon.
- Zero runtime dependencies and zero accounts/backend required for the spike.

## Early playtest signal

The first hands-on playtests produced a stronger behavioral signal than expected:

- the player voluntarily continued through roughly eight different games in the first session
- a later run reached 2528 XP, with the player explicitly wanting to continue to raise difficulty
- the games felt different enough that variety did not collapse into repetition
- difficulty progression created anticipation
- streak/fire feedback added motivation without interrupting the loop
- changing post-game continuation from a prominent **Next** button to swipe-first behavior made the interaction feel closer to the intended `play → swipe → play` loop
- the player asked for personal/global records after naturally wanting another reinforcement layer

This is still anecdotal and from a tiny sample, so it is not product validation. It is enough evidence to keep testing the loop rather than expanding into platform infrastructure.

## Progression / competition

The local layer is now implemented entirely on-device:

- best XP
- best streak
- highest difficulty reached
- longest run / games seen in one run
- visible `NEW BEST` reinforcement when a stored record is crossed

Global competition remains deliberately deferred. Candidate later experiments include daily/weekly leaderboards, percentile messaging such as “top 8% today”, lightweight aliases, and friend/group leaderboards. Do **not** add the backend yet; first prove that multiple people return and voluntarily keep playing.

## Analytics captured

The prototype stores bounded events in `localStorage` and exposes an in-app analytics sheet. Events include:

- `session_start` / `session_end`
- `game_impression` — only a new feed item, never a retry/resume
- `game_first_interaction` with time-to-first-action
- categorized `game_interaction`
- `game_complete` / `game_fail`
- `game_skip` including whether the user interacted first
- `game_retry`
- `game_paused_background` / `game_resumed_after_background`
- `feed_swipe` / `feed_advance`
- `feed_cycle_completed`
- `feed_reach_milestone` for 3 / 5 / 10 / 20 / 50 / 100 feed items
- `difficulty_changed`
- `personal_record_broken`
- visibility/background transitions
- `game_mount_error`, `game_empty_render`, and `feed_transition_error`
- unexpected runtime errors / unhandled promise rejections

The four new mechanics also emit game-specific interaction events such as hazard spawns/dodges/collisions, countdown target hits/timeouts, Snake turns/eats/collisions, and match selections/swaps/clears. Final success/failure still flows through the shared `game_complete` / `game_fail` events so outcome analysis remains consistent across mechanics.

The analytics layer re-syncs with the shared local event store before logging/exporting. That prevents directly captured browser errors or progression events from being overwritten by a later normal gameplay event.

Use **Export JSON** from the app after a playtest, especially if a round ever renders incorrectly.

### Metrics that matter first

Do not optimize revenue, accounts, recommendations, multiplayer, creator tooling or backend infrastructure yet. First inspect:

1. games seen per session
2. fraction reaching game 3 / 5 / 10 / 20
3. immediate-skip rate by mechanic
4. retry rate
5. completion/failure distribution
6. active seconds per game
7. time to first interaction
8. personal-record crossings
9. whether people naturally begin another session later

If people consistently stop after one or two games, adding dozens more games is not the right response. The feed loop itself needs to earn expansion.

## Run locally

ES modules need an HTTP origin rather than opening `index.html` directly.

```bash
cd playable-feed
python3 -m http.server 8080
```

Then open `http://localhost:8080` on desktop or from a phone on the same network using the computer's LAN IP.

The game itself works over a LAN HTTP URL for playtesting, but service workers and normal PWA installation require a secure context. Use an HTTPS deployment (or `localhost` on the same device) when specifically testing install/offline behavior.

For JavaScript checks/tests:

```bash
cd playable-feed
npm test
npm run check
```

No `npm install` is needed.

### CI policy for spikes

There is intentionally **no GitHub Actions workflow** for this spike. Run `npm test` and `npm run check` locally when changing it so small experiments do not consume GitHub Actions quota.

## Suggested next validation step

Put this exact build in front of 5–10 people without explaining the mechanics. Give only one instruction: **"Use this for a few minutes and stop whenever you want."** Export each session's JSON. The main evidence is where they stop, what they skip, what they replay, whether the next-game action becomes automatic, and whether they return later to beat a personal record.

Only after the feed loop shows signal should the spike expand toward remote analytics, recommendation/personalization, global competition and downloadable HTML5 playable content.
