# Playloop GameSpec v0 creator-pressure test

The purpose of this test is to avoid expanding the sandbox by intuition alone. We ask whether a capable AI can express materially different game concepts using only the public v0 language, then record the exact missing primitives where it cannot.

This is not a claim that the supported concepts are polished games. It is a language-pressure test.

## Results

| Requested concept | v0 result | Why / blocker |
| --- | --- | --- |
| Endless dodge | **Supported** | Spawn + velocity + collision + pointer movement + timers already cover it. `Meteor Dodge` / `Space Dodge` prove the shape. |
| Whack-a-mole / moving target | **Supported** | Tap target + timer/random relocation + bounded score/result. `Whack Orb` is a zero-asset example. |
| Collect good objects / avoid bad ones | **Supported** | Multiple tags + collision rules + spawn timers + variables. `Star Catch` is the creator example. |
| Timing / reaction game | **Supported** | Timers, tap events and scalar state are enough for simple reaction/timing loops. |
| Simple shooter | **Partially supported** | Projectiles can be spawned, but authoring becomes awkward because expressions cannot read another entity's current `x/y` to spawn from the player or aim relative to a target. **Missing: bounded entity reads.** |
| Simon / sequence memory | **Partially supported** | Small fixed sequences could be hard-coded, but v0 has no bounded list/array state or indexed access. **Missing: bounded collections/sequence primitive.** |
| Tiny traffic / Bus Jam puzzle | **Poor fit** | Individual pieces could be modeled, but occupancy, cells-ahead and path checks would explode into rules. **Missing: grid/occupancy/query primitives.** |
| Tiny RPG combat | **Partially supported** | A single enemy/player can use global scalar variables, but multiple enemies/cards/items need per-entity state and state inspection. **Missing: entity-local state + entity reads.** |
| Card-like choice game | **Partially supported** | A few fixed tappable choices work, but dynamic hands/decks and per-card state are awkward. **Missing: bounded collections + entity-local state.** |
| Physics stacker | **Not supported** | Position/velocity are available, but there is no rigid-body solver, gravity/contact resolution or bounded physics component. **Missing: reviewed physics primitive/component.** |

## Repeated pressure

The failures are not random. They cluster around a small set of capabilities:

1. **Entity reads** — current position/state of another entity inside an expression.
2. **Entity-local scalar state** — health/team/value/etc. without creating dozens of global variables.
3. **Bounded collections** — short sequences/hands/queues with explicit size limits.
4. **Grid/occupancy queries** — for traffic, match, block and board puzzles.
5. **Declarative animation/tweens** — mostly polish, but important for creator quality and comprehension.
6. **Reviewed high-level physics** — later; substantially more expensive and complex.

The first four increase mechanical range. Animation/tween primarily increases visual quality. Physics is a distinct cost/safety tier and should not be rushed into the instant runtime.

## Recommended v1 order

Do **not** add arbitrary scripting in response to the unsupported examples.

A safer order is:

```text
v0 evidence corpus
   ↓
entity reads
   ↓
entity-local bounded state
   ↓
small aggregate queries / bounded collections
   ↓
grid component
   ↓
animation + tween polish
```

Each step should be added only with schema limits, deterministic semantics, automated-review coverage and a matching KMP contract.

## Why this is encouraging

Three materially different loops are already expressible without changing runtime code:

- survive/avoid;
- catch/avoid;
- moving-target whack/tap.

They can be zero-asset or use reviewed sprites/atlases, and all execute through the same interpreter. The current limitation is therefore not "GameSpec only supports one template." The limitation is that richer stateful genres hit a predictable boundary around **reading/querying structured game state**.

That is a much better next problem than introducing arbitrary JavaScript.

## Next validation step

Give only the public authoring materials to other models/agents:

- `game-spec-v0.schema.json`
- `GAMESPEC-V0.md`
- `AI-CREATOR-TOOLS-V0.md`
- `ai-tools-v0.json`

Ask each to create several games without Playloop source access. Record:

- valid on first attempt;
- number of repair iterations;
- first-play bytes;
- runtime-review result;
- mechanical similarity to existing examples;
- missing primitive requested;
- whether the creator can explain the game without relying on implementation details.

The decision to build `playloop-2d-v1` should come from repeated pressure in that corpus, not from a feature wishlist.
