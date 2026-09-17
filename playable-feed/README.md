# Playable Feed Spike

## Validation question

> After finishing or failing one tiny game, will a person voluntarily swipe into another, and keep doing it?

This is a validation spike, not a platform. The first job is to test the behavioral loop `play → swipe → play` before building accounts, backend, recommendations, creator tooling, or monetization.

## What is implemented

Playloop is a mobile-first PWA with one active game surface at a time and a shared polished shell. The feed currently has 16 mechanics:

1. Tap Rush — tap targets before a visible timer expires.
2. Perfect Stop — stop a moving marker inside the target zone.
3. Bigger Wins — choose the larger value; higher levels introduce addition and subtraction.
4. Green Light — reaction timing; tap only after GO.
5. Symbol Hunt — find the matching symbol.
6. Flash Memory — watch and repeat a short sequence, capped to a 3→5 input difficulty curve.
7. Swipe Call — swipe in the requested direction.
8. Avoid the Block — move lanes to avoid a falling hazard.
9. Quick Count — count scattered objects and choose the answer.
10. Hold Steady — hold/follow a moving target until the bar fills.
11. Odd One — find the different tile.
12. Dodge Stream — survive sequential and overlapping hazards.
13. Jump Rush — hit a target that relocates with a visible countdown ring.
14. Micro Snake — short touch-friendly Snake rounds.
15. Micro Match — compact match-3 with swipe-to-swap, animation and cascades.
16. Bus Jam — directional bus escape puzzle with passenger demand and limited parking.

Each cycle uses every mechanic once before reshuffling. Variants are deterministic inside a session/cycle and change layout, palette, timings, sequence, counts, target positions, speeds, obstacles and other parameters. Difficulty is bounded to 1–5 and adapts from recent outcomes.

## Progression and reinforcement

The current spike includes:

- XP and streaks
- local personal records: best XP, best streak, highest level and longest run
- visible level-up, record and streak-milestone reinforcement
- post-game Like control stored locally
- retry after completion as practice only: once a feed variant has awarded progression, later retries award 0 XP and cannot grow streak/difficulty
- short sound/haptic cues where the browser/device supports them

The goal is enough reinforcement to test continuation without turning the spike into a currency/inventory/meta-game system.

## Navigation and mobile behavior

- Primary continuation is upward swipe.
- Retry remains available after the result.
- Match-3 owns its internal swipe surface so an upward tile swap is not stolen by feed navigation.
- Text selection, callouts and page overscroll are suppressed on the game/feed surface so it behaves more like an app canvas.
- Runtime render failures show a recoverable ROUND ERROR instead of leaving a blank screen.
- Game timers are stopped while the page is backgrounded so hidden time does not corrupt active-time metrics.

## Analytics

Events are stored locally (bounded to the most recent 2500 events) and can be exported as JSON. The export includes anonymous/session identifiers, personal records and liked games.

Important shared events include:

- `session_start`, `session_end`
- `app_ready`, `onboarding_completed`, `feed_started`
- `game_impression`, `game_first_interaction`, `game_interaction`
- `game_complete`, `game_fail`, `game_skip`, `game_retry`
- `game_reward_granted`, `game_reward_suppressed`
- `feed_swipe`, `feed_advance`, `feed_cycle_completed`, `feed_reach_milestone`
- `difficulty_changed`
- `personal_record_broken`, `reward_feedback_shown`
- `game_like_changed`
- renderer/transition/client error events

Game-specific telemetry records things such as Snake turns/eats/collisions, Match swaps/clears/cascades, Dodge hazards/collisions, Bus Jam blocked taps/exits/boarding/parking, and similar mechanic-specific actions.

The Stats sheet currently summarizes Seen, Attempts, Completed, Failed, Skipped, Retries, Avg active and Session, plus local personal records.

## First metrics to inspect

- games seen per session
- reach 3 / 5 / 10 / 20
- immediate skips by mechanic
- retries by mechanic
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

Open `http://localhost:8080` or the machine's LAN IP from a phone. Normal LAN HTTP is enough for gameplay testing. PWA install/offline behavior generally needs HTTPS or localhost.

## Checks

```bash
npm test
npm run check
```

GitHub Actions is intentionally disabled for this spike to avoid spending hosted CI quota. These checks remain available locally.

## First playtest protocol

Use 5–10 people. Give one instruction only:

> Use this for a few minutes and stop whenever you want.

Do not coach individual mechanics unless the player is genuinely blocked. Export the JSON afterward and inspect where they stopped, what they skipped, what they retried, what failed, what they liked and whether continuation became automatic.

## Phone-playtest learnings so far

The builder's own sessions have shown unusually long continuation for an early spike, including a recorded 59-item run, but that is still one-player evidence and must not be treated as product validation.

Specific issues already discovered and fixed include:

- first-game timers starting behind onboarding
- blank rounds from a Safari-observer loop
- retry-based XP farming
- Snake controls/speed and malformed grid rows
- overly steep Flash Memory difficulty
- Match-3 having no satisfying movement/clear animation
- Match-3 upward swipes being misinterpreted as feed navigation
- Bus Jam initially using an abstraction that did not visually read as buses/passengers
- matching Bus Jam passenger/bus disappearing too abruptly; boarding/departure now has explicit visual feedback
- level/record events existing in telemetry but being too easy to miss visually

Detailed notes are in [`PLAYTEST-2026-09-17.md`](./PLAYTEST-2026-09-17.md).

## Creator/social-network hypothesis

A later observation is that the current feed is almost entirely high-attention content. Even when the games remain fun, continuous reaction, memory, timing and puzzle input can become tiring after roughly 15 minutes.

A longer-term hypothesis is therefore a social feed where the post itself is a playable experience: creators or influencers describe/remix games with AI, users can passively watch a short autoplay/ghost preview or another player's run, then choose when to jump into play.

The first creator framework should be constrained and declarative. AI should generate a safe `GameSpec` over supported mechanics rather than arbitrary JavaScript. That keeps lifecycle, analytics, security and moderation under the runtime's control.

The full hypothesis and proposed validation order are documented in [`CREATOR-NETWORK-HYPOTHESIS.md`](./CREATOR-NETWORK-HYPOTHESIS.md).

## Expansion gate

Do **not** immediately build 20+ additional mechanics, accounts, publishing infrastructure, global leaderboards, remote analytics, ranking/personalization, downloadable content or a creator backend.

The next gates are:

1. external users show the same continuation signal seen in the builder's sessions
2. repeat sessions appear, not just one long novelty session
3. likes/telemetry reveal which mechanics actually carry the feed
4. a cheap passive-preview experiment shows lower-fatigue consumption can extend sessions
5. a tiny declarative GameSpec can generate useful variations for 2–3 existing mechanics

Only after those signals should the spike become a platform.
