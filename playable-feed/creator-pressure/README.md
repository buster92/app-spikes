# Playloop v3 creator-pressure protocol

This milestone tests whether the public GameSpec authoring contract is sufficient for AI creators **without giving the model Playloop source code**.

The goal is not to make every prompt pass. A clean `blocked` result is valuable when the requested mechanic cannot be expressed inside the bounded declarative runtime. We want evidence for future capability decisions, not pressure to smuggle general scripting into v3.

## Public-only authoring packet

For a true external-AI run, use the generated packet rather than assembling files manually:

```bash
npm run pressure:v3:packet -- crate-push > /tmp/playloop-crate-push.md
```

Use a different id from `npm run pressure:v3:cases` for another case.

The packet contains, in order:

1. the case prompt;
2. a generated machine-readable `playloop-2d-v3` capability snapshot;
3. an explicit machine-readable authoring grammar for comparisons, condition combinators, conditional actions and event references;
4. `sandbox/GAMESPEC-AUTHORING-QUICK-REFERENCE.md`;
5. the v0-v3 version references;
6. AI tool metadata and the v0 schema baseline.

The runtime ladder is additive. `playloop-2d-v3` inherits supported v0-v2 syntax; the model must not infer that `if`, comparisons or entity-local state are unavailable merely because the v3 document focuses on grids.

Do **not** give the model runtime/validator source, tests, implementation examples, or existing GameSpecs during the first attempt. The first-pass metric is meant to measure the public contract itself.

After a failed attempt, return only the structured validator/review diagnostics produced by the creator tools. The model may then repair its submission. Do not manually explain the implementation unless the experiment has ended.

## Submission envelope

Each attempt must be returned as **raw JSON only**: no prose and no Markdown fences.

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

Malformed external output is still evidence. The evaluator does not abort the entire batch when one response is invalid JSON. Instead it records a per-file `format_error` result and continues. Markdown-fenced JSON is reported as `MARKDOWN_FENCE`; other parse failures are reported as `INVALID_JSON`. When a `caseId` and `attempt` can be safely recovered from the text, the format failure counts against that case's first-pass metrics.

The report records:

- first-pass validation rate;
- first-pass automated-review rate;
- repair iterations until the first review pass;
- runtime/version chosen by the creator;
- GameSpec size;
- structured diagnostic frequency, including protocol/format errors;
- explicit capability blockers;
- cases that were never attempted.

The aggregate first-pass rates are **case-level metrics**: a case counts as first-pass valid when at least one attempt numbered `1` for that case is valid. When comparing models directly, inspect the individual `results` entries as well as the case aggregate.

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

This reference also exposes an authoring ergonomics pressure point: with multiple interchangeable crates, a creator currently has no bounded `entityAtCell`/occupant query. A small known set can be enumerated by id, but that becomes verbose as the number of movable pieces grows. Treat that as a measured candidate gap; do not add it to v3 until external pressure shows repeated need after the public authoring contract is clear.

## Decision rule

After at least two external models have attempted the full or representative case set, review the evidence:

- repeated claims that already-supported syntax is unavailable → improve public authoring docs/grammar first;
- repeated validation mistakes across otherwise simple cases → improve authoring docs/tool schema first;
- repeated awkward but valid GameSpecs → consider higher-level authoring helpers that compile down to existing GameSpec;
- repeated budget failures caused by fixed-id enumeration → investigate whether one smaller reusable bounded primitive can replace the repetition;
- repeated clean `blocked` results for the same bounded mechanic after documentation hardening → candidate runtime capability;
- one-off unsupported requests → keep the runtime smaller;
- any request that would require arbitrary loops/code/host authority → keep it outside GameSpec.

Do not freeze v3 compatibility based only on the internal Sokoban reference. External creator pressure and JS↔KMP parity are still required.
