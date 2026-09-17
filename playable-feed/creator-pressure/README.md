# Playloop v3 creator-pressure protocol

This milestone tests whether the public GameSpec authoring contract is sufficient for AI creators **without giving the model Playloop source code**.

The goal is not to make every prompt pass. A clean `blocked` result is valuable when the requested mechanic cannot be expressed inside the bounded declarative runtime. We want evidence for future capability decisions, not pressure to smuggle general scripting into v3.

## Public-only authoring packet

For a true external-AI run, give the model only these repository files:

- `sandbox/GAMESPEC-V0.md`
- `sandbox/GAMESPEC-V1-DRAFT.md`
- `sandbox/GAMESPEC-V2-DRAFT.md`
- `sandbox/GAMESPEC-V3-DRAFT.md`
- `sandbox/ai-tools-v3-draft.json`
- `sandbox/game-spec-v0.schema.json`
- one case prompt from `creator-pressure/v3-cases.json`

Do **not** give the model runtime/validator source, tests, implementation examples, or existing GameSpecs during the first attempt. The first-pass metric is meant to measure the public contract itself.

After a failed attempt, return only the structured validator/review diagnostics produced by the creator tools. The model may then repair its submission. Do not manually explain the implementation unless the experiment has ended.

The repository can generate a single paste-ready packet for a case so the external model sees the exact same public-only material every time:

```bash
npm run pressure:v3:packet -- crate-push > /tmp/playloop-crate-push.md
```

Use a different id from `npm run pressure:v3:cases` for another case.

## Submission envelope

Each attempt is a JSON document:

```json
{
  "caseId": "crate-push",
  "attempt": 1,
  "author": {
    "kind": "external_ai",
    "provider": "example-provider",
    "model": "example-model"
  },
  "status": "submitted",
  "blockers": [],
  "spec": {
    "schemaVersion": 1,
    "runtime": "playloop-2d-v3"
  }
}
```

If the model concludes that the mechanic cannot be represented without violating the published contract, it should return:

```json
{
  "caseId": "match-line",
  "attempt": 1,
  "author": {
    "kind": "external_ai",
    "provider": "example-provider",
    "model": "example-model"
  },
  "status": "blocked",
  "blockers": [
    "Need a bounded way to inspect matching neighbors without enumerating every board cell"
  ]
}
```

A blocked response is preferable to invented fields, arbitrary code, hidden host access, or pretending an unsupported mechanic works.

## Running the evaluator

From `playable-feed`:

```bash
npm run pressure:v3:cases
npm run pressure:v3 -- path/to/submissions
```

The second command accepts one or more JSON files or directories. A JSON file may contain one submission envelope or an array of envelopes.

The report records:

- first-pass validation rate;
- first-pass automated-review rate;
- repair iterations until the first review pass;
- runtime/version chosen by the creator;
- GameSpec size;
- structured diagnostic frequency;
- explicit capability blockers;
- cases that were never attempted.

## Case set

`v3-cases.json` intentionally spans v0-v3 and also includes prompts likely to stress missing bounded primitives. This matters because a creator should choose the smallest sufficient runtime rather than defaulting every game to v3.

The current set covers:

- reaction/tap;
- dodge;
- shooter/entity reads;
- entity-local state;
- bounded sequences/queues;
- traffic/path-to-edge;
- Sokoban-style pushing;
- sliding-to-obstacle;
- neighbor toggling;
- match lines;
- growing grid occupancy.

## Internal reference pressure result

`examples/sokoban-push-v3.game.json` is an **internal reference**, not an external-AI result. It proves that a one-crate Sokoban interaction can be expressed with the current v3 contract by composing:

- fixed grid entities;
- `column` / `row` reads;
- button-local `dx` / `dy` state;
- `canMoveBy`;
- ordered `moveGridBy` actions;
- occupancy derived from live grid entities.

It deliberately does not add a Sokoban-specific opcode.

This reference also exposes an authoring ergonomics pressure point: with multiple interchangeable crates, a creator currently has no bounded `entityAtCell`/occupant query. A small known set can be enumerated by id, but that becomes verbose as the number of movable pieces grows. Treat that as a measured candidate gap; do not add it to v3 until external pressure shows repeated need.

## Decision rule

After at least two external models have attempted the full or representative case set, review the evidence:

- repeated validation mistakes across otherwise simple cases → improve authoring docs/tool schema first;
- repeated awkward but valid GameSpecs → consider higher-level authoring helpers that compile down to existing GameSpec;
- repeated clean `blocked` results for the same bounded mechanic → candidate runtime capability;
- one-off unsupported requests → keep the runtime smaller;
- any request that would require arbitrary loops/code/host authority → keep it outside GameSpec.

Do not freeze v3 compatibility based only on the internal Sokoban reference. External creator pressure and JS↔KMP parity are still required.
