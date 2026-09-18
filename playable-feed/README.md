# Playable Feed Spike

## Playloop social v0

The default app is now a working local-first social-playable foundation. It opens into creator-framed **Discover**, with separate **Following**, **Challenges**, **Profile**, and **Create** surfaces.

The complete v0 loop is usable on one device:

`creator post → follow → exact playable → local result comparison → Like / outbound Challenge; inbound Challenge → response; publish`

Run it locally:

```bash
cd playable-feed
npm run serve
```

Open `http://localhost:8080`. State is stored under the versioned `playloop.social.v1` local record and survives reload. Use `http://localhost:8080/?legacy=1` for the original anonymous handcrafted-feed playtest/control surface. Creator Lab remains at `/creator-lab.html`.

Use `http://localhost:8080/?presentation=anonymous` for the QA control presentation: it runs the exact same post/playable data without creator identity, caption, benchmark-opponent framing or social CTAs. It is not a randomized experiment assignment yet; social funnel events still include the manual presentation value for later analysis. If browser storage is blocked, the app remains usable for the session and displays a non-persistent-mode warning.

The Create flow intentionally uses only approved bundled GameSpecs. A creator must complete the selected playable to establish the benchmark; captions cannot provide a fake score. Posts and challenges retain the exact runtime, content-addressed manifest/spec refs and seed.

Architecture and extension boundaries are documented in [`SOCIAL-V0-ARCHITECTURE.md`](./SOCIAL-V0-ARCHITECTURE.md).

### Short social-v0 smoke check

1. Open the app and confirm Discover contains creator posts.
2. Open a creator profile and follow them.
3. Confirm their posts appear in Following.
4. Play a creator post and inspect the result comparison.
5. Like it and create an outbound Challenge; confirm it remains pending/cancellable rather than impersonating the remote creator.
6. Open Challenges and complete the seeded inbound challenge from another creator.
7. Open Create, choose a playable, complete the benchmark and publish a caption.
8. Confirm the new post appears first on your profile, reload, and verify the social state remains.

## Two validation tracks

The repository now contains two related but distinct experiments:

1. the original **consumer loop** — does `play → swipe → play` create voluntary continuation?;
2. the newer **Playloop creator-runtime** — can creators/AIs publish genuinely varied, lightweight playable posts without shipping arbitrary executable code?

The handcrafted PWA remains useful evidence about feed behavior and fatigue. The creator-runtime work under `sandbox/` is the foundation for the broader product direction: a social platform where posts can combine video/passive media with bounded playable experiences that followers can play, challenge and remix.

The durable product vision is documented in [`PRODUCT-VISION.md`](./PRODUCT-VISION.md): games as a social content format, not a game catalog; AI as an increasingly invisible facilitator; creators competing on meaningful `plays`, challenges and remixes; and a longer-term path for interactive brand content.

Accounts, comments, follows, ranking, payments and other social capabilities belong to the trusted Playloop shell/backend. They are deliberately **not** capabilities exposed to creator GameSpec content.

## Original consumer validation question

> After finishing or failing one tiny game, will a person voluntarily swipe into another, and keep doing it?

The current mobile-first PWA has one active game surface at a time and a shared polished shell. It is still a useful consumer-behavior spike rather than evidence that the full social product is validated.

## What is implemented in the handcrafted feed

The feed currently has 16 mechanics:

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

The goal is enough reinforcement to test continuation without turning the handcrafted spike into a currency/inventory/meta-game system.

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

## Experiment report

Exported Playloop event logs can be aggregated into a compact experiment report without a backend or analytics vendor.

```bash
npm run report:experiment -- playloop-events-1.json
npm run report:experiment -- run-a.json run-b.json --experiment onboarding_value_prop_v1
npm run report:experiment -- run-a.json run-b.json --format json --out report.json
```

The Markdown report is intentionally optimized for a fast product read. Per variant it shows exposed-session count, feed-start and first-interaction rates, reach 3/5/10, median time to feed start, median time to first interaction, median games seen, and guardrails for client errors, pre-feed exits, immediate skips, and load/render failures.

Analysis is session-based rather than event-based. Forced QA exposures are excluded, repeated exports are deduplicated by event id, conflicting variant assignments are excluded, duplicate exposure records are collapsed, and post-exposure KPI events missing matching experiment context are surfaced as a data-quality warning. The report shows directional percentage-point differences versus control when available, but deliberately does not declare a winner or infer statistical significance.

## First consumer metrics to inspect

- games seen per session
- reach 3 / 5 / 10 / 20
- immediate skips by mechanic
- retries by mechanic
- completion/failure rate
- active seconds per game
- time to first interaction
- likes by mechanic
- repeat sessions

If people consistently stop after 1–2 games, adding dozens more handcrafted mechanics is not the right response. The continuation/content mix needs to change first.

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

GitHub Actions is intentionally disabled for this spike to avoid spending hosted CI quota. These checks remain available locally and should be run from a real checkout before merging creator-runtime changes.

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

The handcrafted feed is almost entirely high-attention content. Even when the games remain fun, continuous reaction, memory, timing and puzzle input can become tiring after a longer session.

The broader product hypothesis is therefore a social feed where creators/influencers can use AI to make lightweight playable posts, pair them with video/passive content, and let followers choose when to watch versus play. Challenges/remixes/social interactions belong around the playable rather than inside an untrusted creator runtime.

The full hypothesis and proposed validation order are documented in [`CREATOR-NETWORK-HYPOTHESIS.md`](./CREATOR-NETWORK-HYPOTHESIS.md).

## Versioned GameSpec creator runtime

The `feature/gamespec-sandbox-v0` workstream now goes well beyond the original v0 proof. Its architecture is still intentionally small and declarative: creator games are bounded JSON data plus reviewed content-addressed assets, never arbitrary JavaScript/WASM/native code.

Current runtime ladder:

```text
playloop-2d-v0
  primitives + sprites + timers + collisions + scalar globals

playloop-2d-v1 (experimental)
  + bounded entity reads and entity-local scalar state

playloop-2d-v2 (experimental)
  + bounded scalar collections for sequences/queues/hands

playloop-2d-v3 (experimental)
  + bounded grids, occupancy/path queries and deterministic grid movement
```

The workstream includes:

- machine-readable GameSpec authoring contracts;
- bounded executable validation plus stricter publication-policy validation;
- deterministic DOM-free runtime and operation/time/entity ceilings;
- host-side effect throttling and failure reporting;
- reviewed SHA-256 asset contracts, atlas support, decoded-memory reservations and residency controls;
- content-addressed transport/publication manifests with tiny social-feed descriptors;
- deterministic automated review and replay fixtures;
- AI-facing creator capabilities/diagnostics and JSON CLIs;
- Creator Lab for paste/validate/simulate/run without evaluating creator code;
- KMP contracts for commonMain logical semantics and platform host adapters;
- v1 `Pocket Shooter` / `Garden Catch`, v2 `Pattern Echo`, and v3 `Bus Escape` reference games.

v3 is wired through the same versioned transport, publication, creator-tooling, review and replay paths as earlier runtimes. It remains experimental until creator-pressure and JS↔KMP parity work justify freezing its wire semantics.

Current instant-tier targets remain 16 KB GameSpec, 256 KB declared assets and 300 KB combined first-play package. Creator content has no direct network, DOM, filesystem, account, social, payment or unrestricted device authority.

Start with [`sandbox/README.md`](./sandbox/README.md) and [`sandbox/NEXT-CHAT-HANDOFF.md`](./sandbox/NEXT-CHAT-HANDOFF.md) for the current creator-runtime state.

## Next validation gates

Do not respond to the platform ambition by immediately building every social feature or by adding a general scripting language.

The next evidence gates are:

1. run the complete local creator-runtime test/check suite from an actual checkout;
2. give external AIs only the public v3 authoring materials and measure validity/repair iterations;
3. pressure-test at least one additional grid genre so v3 is not justified only by Bus Escape;
4. implement validator/runtime/replay parity in KMP `commonMain` and compare golden snapshots;
5. continue testing the mixed passive/playable feed hypothesis with real users;
6. add the next runtime capability only when repeated creator pressure identifies a bounded primitive worth standardizing.

Only after those signals should the spike expand into full creator publishing, recommendations, accounts and monetization infrastructure.
