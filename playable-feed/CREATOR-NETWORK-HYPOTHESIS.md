# Creator network hypothesis

> The broader north-star framing — playable experiences as a first-class content medium, AI as an invisible facilitator, creator `plays`, brand use cases, and adjacent LinkedIn/Netflix signals — is captured in [`PRODUCT-VISION.md`](./PRODUCT-VISION.md).

## Observation

The microgame feed is fun and can sustain repeated play, but the current loop is high-attention: reaction, memory, timing, puzzle solving, and frequent touch input. After roughly 15 minutes it can become mentally tiring even when the individual games are still enjoyable.

That suggests two distinct product loops may be useful:

1. **Active loop** — play a tiny game, get a result, swipe, repeat.
2. **Low-effort / passive loop** — browse creators, watch short game previews or runs, see challenges and reactions, then choose when to jump into play.

The goal is not to turn Playloop into a video feed with games attached. The passive layer should make discovering games and creators effortless while preserving the playable object as the core content unit.

## Platform hypothesis

Playloop could evolve into a social network where posts can contain playable experiences.

A creator or influencer describes a game to AI, previews it, adjusts it, and publishes it as part of a creator post. Other users can watch a short video/autoplay/ghost preview, play it, like it, retry it, challenge friends, or remix it.

Potential consumer loop:

`creator post → watch/understand challenge → play if interested → result → challenge/remix/respond → swipe`

Potential creator loop:

`idea → AI-assisted safe GameSpec → preview/tune → attach framing/video → publish → receive plays/results/challenges/remixes`

This could solve two problems at once:

- content supply is no longer limited to games manually authored by the Playloop team;
- the feed gains lower-effort social consumption between intense active rounds.

The game should increasingly be treated as an **interaction primitive between a creator and an audience**, not merely another anonymous content unit.

## Important constraint: do not let AI publish arbitrary JavaScript

The first creator framework should be declarative and sandboxed. AI should generate a constrained **GameSpec**, not executable application code.

Example shape:

```json
{
  "title": "Meteor Dodge",
  "template": "lane_dodge",
  "duration_s": 12,
  "theme": {
    "background": "space",
    "player": "ship",
    "hazard": "meteor"
  },
  "rules": {
    "lanes": 3,
    "waves": 8,
    "simultaneous_hazards": 2,
    "speed": 1.25
  },
  "win": {
    "type": "survive_all_waves"
  }
}
```

The runtime owns input, timing, lifecycle, logging, score, accessibility, and safety. The AI only chooses supported mechanics, parameters, text, art references, and combinations.

## Small framework, not a game engine

A first creator framework could expose a handful of primitives already proven by the spike:

- tap target / moving target
- choose between answers
- sequence / memory
- swipe direction
- dodge / lane movement
- hold / track target
- grid movement / snake
- match-3
- directional traffic/bus puzzle

Each primitive receives configuration and emits the same common lifecycle:

- `mount`
- `interaction`
- `complete`
- `fail`
- `destroy`

This keeps analytics comparable across creator games and makes generated content much safer than arbitrary code.

## Passive-consumption experiments

Before building accounts or a creator backend, test whether a lower-effort layer actually extends sessions. Cheap experiments:

- **Autoplay preview:** a 3–6 second bot/ghost demonstration runs before the player touches the card. Tap anywhere to take over.
- **Watch a run:** show a short recorded/seeded successful run from another player or creator.
- **Creator card:** avatar/name/caption + playable game. Scrolling can remain passive until the player taps `Play`.
- **Challenge result:** `Andrés scored 840 — can you beat it?` with a replay preview.
- **Remix feed:** show two visually different versions generated from the same mechanic to test whether creator identity/theme adds interest.

The important measurement is whether users stay longer **without** increasing fatigue, not merely whether autoplay increases screen time.

## Research update — 2026-09-17

The competitive and user research is documented in [`SOCIAL-PLAYABLE-NETWORK-RESEARCH-2026-09-17.md`](./SOCIAL-PLAYABLE-NETWORK-RESEARCH-2026-09-17.md).

The research changes the product framing in an important way:

- Aippy/Gizmo/HypeHype/Playbyte show that **AI creation + playable feed + remix** is not novel by itself.
- Aippy/Gizmo reviews show repeated pain around AI misunderstanding creator intent, regressions, basic/samey generated games, opaque AI use, creation-currency interruption, and reliability.
- HypeHype's own postmortem/pivot says a powerful mobile editor was still too complex for most creators.
- broader social-feed research shows strong demand for more algorithm transparency/control and persistent creator frustration with volatile reach;
- UGC platforms show that free-form social/content authority creates a major moderation surface;
- independent social games repeatedly converge on friend challenges, deterministic daily challenges, ghosts, verified results, creator-made levels and remixing.

### Research-informed product principles

1. **Human creator first; AI assistant second.**
2. **AI changes should be inspectable and reversible** — preview/diff/undo and last-known-good versions matter.
3. **Generation is not publication.** Safety, quality, similarity and completeness checks sit between them.
4. **Original/remix provenance should survive distribution.**
5. **Following must mean something.** Do not make opaque discovery ranking the only way to reach an audience.
6. **Give feed agency:** discovery, following and direct challenges should be distinguishable surfaces with clear negative-preference controls.
7. **Competition must be trustworthy:** deterministic/verified results, no pay-to-win, and replay/ghost semantics are strategically useful.
8. **Keep social authority outside GameSpec.** Games do not directly message users, access accounts, transact, or fetch arbitrary creator content.
9. **Free-form user text/drawing/upload is a separate moderation problem.** Do not casually expose it through the instant runtime.
10. **Do not optimize only for uninterrupted screen time.** Meaningful creator/follower interaction, return rate, challenges, remixes and fatigue matter more than raw minutes.
11. **Runtime expressiveness must not become creator-tool complexity.** The ideal creator path remains `idea → playable draft → understandable controls → preview → publish`.
12. **Do not monetize broken flow.** Never charge creators merely to repair AI/platform mistakes, and do not corrupt competitive play with purchased advantage.

## Updated differentiation hypothesis

The generic pitch:

> TikTok where every swipe is an AI-generated mini-game.

is already occupied.

The stronger wedge to validate is:

> **A creator can turn a social post into a playable challenge, and followers can answer through play — beat it, replay it, remix it, challenge someone else, or respond with their own version.**

Example:

`creator video: "Nobody gets over 40" → attached game → follower scores 47 → verified result/ghost → challenge friends → remix → new attributed post`

The value is not merely that the post contains a game. The value is that the game creates a new kind of social response.

## Validation order

Do not build the full social network yet.

1. Finish proving that the bounded GameSpec/runtime can safely express varied creator games.
2. Prototype one **creator-framed challenge post**: short creator framing/video + attached GameSpec + creator score/claim.
3. A/B the exact same game as an anonymous game card vs a creator-framed challenge.
4. Measure play-start, completion/retry, challenge intent, remix intent, creator recall, and fatigue — not only session duration.
5. Prototype a deterministic asynchronous challenge using the existing replay direction: exact version/seed → friend run → verified result → ghost/rematch.
6. Test AI creation recovery: bad AI iteration → diff/preview → undo → lock mechanic/theme → restore known-good version. Success means the creator still feels in control.
7. Only after the social delta is visible should Playloop invest deeply in profiles, follows, comments, recommendation infrastructure, creator analytics, moderation operations and monetization.

## Main risk

AI-generated content solves **supply**, but it does not automatically solve **quality, discovery, moderation, creator control, trust, or fatigue**. If every generated game is another demanding 10-second reflex task — or another interchangeable AI artifact — infinite content can make the product worse rather than better.

The strongest current thesis is therefore:

> **A social platform where creators publish posts their audience can play back, beat, remix, and respond to, with a bounded deterministic runtime making those interactions fast, safe, lightweight, verifiable and portable.**
