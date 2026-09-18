# Playloop experimentation v1

This document defines the first product-experiment contract for Playloop. It is deliberately outside the GameSpec/runtime contract: experiments belong to the trusted product shell, never to creator-authored game data.

## Why this exists

Playloop will need to tune more than game mechanics. Important unknowns include onboarding, feed pacing, when a passive/video post should turn into a playable, challenge/remix calls to action, social proof, retry/next behavior, creator presentation, and recommendation strategy.

Those questions are easy to measure badly. In particular, assigning a user to a variant is not the same as actually showing the variant. V1 therefore separates deterministic assignment from explicit exposure.

## Contract

`src/experiments.js` owns deterministic product bucketing. `Analytics.experimentVariant(id, properties)` is the integration point for a surface that actually consumes an experiment.

Rules:

1. Assignment is stable for the same anonymous Playloop id and experiment id.
2. Assignment is independent per experiment.
3. An experiment may allocate less than 100% of identities.
4. A surface must call `experimentVariant(...)` only when it is about to render/use that experiment.
5. The first use emits exactly one `experiment_exposure` event for the session.
6. After exposure, subsequent analytics events carry `experiment_context`, keyed by experiment id.
7. URL overrides are QA/debug tools only. Forced exposures are marked `forced: true` and must be excluded from experiment KPI analysis.
8. Creator GameSpecs cannot select, read, or affect product experiment assignment.
9. Once an experiment has produced real exposures, its id, variant set, and weights are immutable. Material changes require a new experiment id; changing weights under the same id can move an existing anonymous identity to a different variant.
10. Surface metadata cannot override canonical exposure or analytics-envelope fields; reserved keys are stripped before logging.
11. Active exposure records are retention-protected for the current session. Rolling event truncation and local event-history clearing must keep the canonical exposure record while downstream events continue to carry that experiment context.
12. Product-shell event writers must use the central analytics pipeline after startup so experiment context, session identity, retention limits, and attribution rules are applied consistently. Pre-startup crash logging may use the minimal fallback because no experiment can have been exposed yet.

Example integration:

```js
const variant = analytics.experimentVariant("onboarding_value_prop_v1", {
  surface: "onboarding",
});

if (variant === "instant_play") {
  // Trusted shell changes only.
}
```

Manual QA can force a registered variant without changing the stored anonymous id:

```text
?exp=onboarding_value_prop_v1:control
?exp=onboarding_value_prop_v1:instant_play
```

Multiple overrides may use repeated `exp` parameters or comma-separated pairs.

## Event semantics

An exposure event contains:

- `experiment_id`
- `variant_id`
- `forced`
- `allocation_bucket` for normal assignment
- `variant_bucket` for normal assignment
- optional trusted surface metadata

Normal downstream events contain an `experiment_context` object only after an experiment has actually been exposed in that session. This prevents an assigned-but-never-seen user from contaminating the treatment denominator.

The exported playtest payload also includes the session's current exposed experiment context.

## First candidate: onboarding value proposition

The registry contains `onboarding_value_prop_v1` with two equally weighted variants:

- `control`
- `instant_play`

This PR registers the experiment infrastructure and candidate definition but does **not** change the current onboarding UI. That is intentional: the current runtime/feed playtest should remain untouched while it is still awaiting manual testing. A later product-only change can consume this experiment without modifying GameSpec/runtime semantics.

When activated, the hypothesis should be narrow: emphasizing immediate playable value may increase the percentage of exposed sessions that enter the feed and reach a first interaction quickly.

## Metrics

For an onboarding experiment, analyze only sessions with a non-forced `experiment_exposure` for that experiment.

Primary metric:

- feed-start rate = sessions with `feed_started` / exposed sessions

Secondary metrics:

- first-interaction rate = sessions with `game_first_interaction` / exposed sessions
- time to feed start from `session_ms` on the first `feed_started`
- time to first game interaction from `session_ms` on the first `game_first_interaction`
- three-game reach = sessions with `feed_reach_milestone` where `games_seen >= 3` / exposed sessions

Guardrails:

- client-error sessions
- sessions ending before `feed_started`
- immediate game skip without interaction
- game-load/empty-render errors

Do not optimize raw session duration by itself. A longer session can mean stronger engagement, confusion, a stuck game, or simply leaving the tab open.

## Analysis discipline

Do not call a result a win from a handful of manual playtests. The local prototype is useful for checking event correctness and obvious UX direction, not statistical confidence.

Before a real rollout, define in advance:

- hypothesis
- exact surface and population
- primary metric
- guardrails
- minimum runtime/sample target
- exclusion rules, especially `forced: true`
- decision rule for continue, change, or stop

Avoid running several experiments that modify the same decision point unless their interaction is intentionally modeled. Stable bucketing does not eliminate interaction effects.

## Privacy and safety

Experiment assignment uses the existing anonymous local id. It does not require account identity, advertising identifiers, creator data, contacts, device identity, or cross-product tracking.

Keep experiment metadata low-cardinality. Do not place arbitrary user text, comments, prompts, or GameSpec payloads into experiment properties. Canonical exposure fields (`experiment_id`, `variant_id`, `forced`, allocation/variant buckets) and analytics-envelope fields are reserved and cannot be supplied by a surface.
