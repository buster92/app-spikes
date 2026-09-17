# Creator network hypothesis

## Observation

The microgame feed is fun and can sustain repeated play, but the current loop is high-attention: reaction, memory, timing, puzzle solving, and frequent touch input. After roughly 15 minutes it can become mentally tiring even when the individual games are still enjoyable.

That suggests two distinct product loops may be useful:

1. **Active loop** — play a tiny game, get a result, swipe, repeat.
2. **Low-effort / passive loop** — browse creators, watch short game previews or runs, see challenges and reactions, then choose when to jump into play.

The goal is not to turn Playloop into a video feed with games attached. The passive layer should make discovering games and creators effortless while preserving the playable object as the core content unit.

## Platform hypothesis

Playloop could evolve into a social network where the post is a playable game.

A creator or influencer describes a game to AI, previews it, adjusts it, and publishes it. Other users can watch a short autoplay/ghost preview, play it, like it, retry it, challenge friends, or remix it.

Potential consumer loop:

`watch preview → play if interested → result → like/challenge/remix → swipe`

Potential creator loop:

`describe idea → AI builds safe GameSpec → preview → tune → publish → receive plays/likes/completions/remixes`

This could solve two problems at once:

- content supply is no longer limited to games manually authored by the Playloop team
- the feed gains lower-effort consumption between intense active rounds

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

## Validation order

Do not build the social network yet.

1. Keep improving the current playable feed until external users show the same continuation behavior seen in internal playtests.
2. Add one passive-preview experiment to the existing feed.
3. Build a tiny declarative GameSpec for 2–3 existing mechanics.
4. Use AI internally to generate 10–20 games through that spec; no public creator UI yet.
5. Test whether generated creator-style content feels meaningfully fresher and whether passive previews increase session length.
6. Only then consider publishing, profiles, follows, comments, global rankings, moderation, creator analytics, and monetization.

## Main risk

AI-generated content solves **supply**, but it does not automatically solve **quality, discovery, moderation, or fatigue**. If every generated game is another demanding 10-second reflex task, the feed can still exhaust the player faster even with infinite content.

The strongest version of the idea is therefore not simply “TikTok where AI makes games.” It is:

> A social feed where the post is a tiny playable experience, creators can make/remix those experiences with AI, and users can fluidly switch between watching and playing.
