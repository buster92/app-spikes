# GameSpec authoring quick reference — v0 through v3 draft

This file is a compact authoring companion for external AI creators. It does **not** add runtime capabilities. It makes inherited syntax explicit so an author does not incorrectly treat an older capability as absent merely because a newer version document focuses only on its additions.

## Runtime ladder is additive

`playloop-2d-v3` includes the supported authoring semantics of v0, v1 and v2 plus v3 grids. In particular, v3 still supports:

- v0 variables, math, conditions, `if`, timers, collision/input rules, spawn/destroy, complete/fail and host-effect requests;
- v1 bounded entity reads and scalar entity-local state;
- v2 bounded scalar collections;
- v3 grids, occupancy/path reads and deterministic grid movement.

Before declaring a mechanic blocked, check the inherited syntax below and the machine-readable capability snapshot included in the creator-pressure packet.

## Expressions are not conditions

A normal expression can be a literal or one of the supported expression objects.

Examples:

```json
{ "var": "score" }
{ "event": "x" }
{ "random": [0, 360] }
{ "add": [{ "var": "score" }, 10] }
{ "sub": [1000, { "mul": [{ "var": "moves" }, 10] }] }
```

Base math operators are:

```text
add  sub  mul  div  min  max
```

Math operators accept 2–8 operands. Expression nesting is bounded.

v1 entity reads are also expressions:

```json
{ "entity": { "ref": "player", "field": "x" } }
{ "entity": { "ref": "$target", "state": "dx" } }
```

v2 collection reads and v3 grid reads are described in their version documents.

## Conditions

Comparison/equality is expressed with a **condition object**, not an expression opcode:

```json
{
  "left": { "var": "score" },
  "op": ">=",
  "right": 10
}
```

Supported comparison operators:

```text
==  !=  >  >=  <  <=
```

Conditions compose with `all`, `any` and `not`:

```json
{
  "all": [
    {
      "left": { "var": "lives" },
      "op": ">",
      "right": 0
    },
    {
      "not": {
        "left": { "var": "paused" },
        "op": "==",
        "right": true
      }
    }
  ]
}
```

A rule may have a top-level `condition` using this same grammar.

## Conditional action blocks

`if` is a normal action and uses `condition`, `then`, and optional `else`:

```json
{
  "if": {
    "condition": {
      "left": { "var": "lives" },
      "op": ">",
      "right": 0
    },
    "then": [
      { "addVar": { "name": "score", "value": 1 } }
    ],
    "else": [
      { "fail": { "score": 0, "detail": "No lives left" } }
    ]
  }
}
```

Nested conditionals are allowed within the normal action/depth budgets. Do not invent ternary expressions or boolean expression opcodes when a condition block is the supported representation.

## Event-scoped references

The bounded event references are:

```text
$target   tap, pointerDown, pointerMove, pointerUp, entityExit
$a, $b    collision
```

They can be used in supported entity/grid actions and reads during that event. They are not persistent object references and cannot be stored in scalar variables for use in a later event.

Example: directional buttons can keep their delta in entity-local scalar state:

```json
{
  "id": "right",
  "kind": "text",
  "state": { "dx": 1, "dy": 0 },
  "x": 240,
  "y": 466,
  "width": 54,
  "height": 46,
  "text": "→",
  "interactive": true,
  "collidable": false
}
```

A tap rule can read that state with:

```json
{ "entity": { "ref": "$target", "state": "dx" } }
```

## v3 grid composition example

For a bounded board with one known player and one known crate, occupant discovery is not necessary. The author can compare the player's intended next coordinate with the known crate coordinate.

Adjacent-crate condition:

```json
{
  "all": [
    {
      "left": {
        "add": [
          { "grid": { "op": "column", "entity": "player" } },
          { "entity": { "ref": "$target", "state": "dx" } }
        ]
      },
      "op": "==",
      "right": { "grid": { "op": "column", "entity": "crate" } }
    },
    {
      "left": {
        "add": [
          { "grid": { "op": "row", "entity": "player" } },
          { "entity": { "ref": "$target", "state": "dy" } }
        ]
      },
      "op": "==",
      "right": { "grid": { "op": "row", "entity": "crate" } }
    }
  ]
}
```

Then test the crate destination:

```json
{
  "left": {
    "grid": {
      "op": "canMoveBy",
      "entity": "crate",
      "dx": { "entity": { "ref": "$target", "state": "dx" } },
      "dy": { "entity": { "ref": "$target", "state": "dy" } }
    }
  },
  "op": "==",
  "right": true
}
```

If true, move the crate first and the player second:

```json
[
  {
    "moveGridBy": {
      "entity": "crate",
      "dx": { "entity": { "ref": "$target", "state": "dx" } },
      "dy": { "entity": { "ref": "$target", "state": "dy" } }
    }
  },
  {
    "moveGridBy": {
      "entity": "player",
      "dx": { "entity": { "ref": "$target", "state": "dx" } },
      "dy": { "entity": { "ref": "$target", "state": "dy" } }
    }
  }
]
```

This is intentionally a composition pattern, not a Sokoban-specific runtime opcode.

## Important real limitations

The current v3 draft still does **not** provide:

- a dynamic `entityAtCell` / occupant lookup;
- neighbor or match-line aggregation;
- nearest-entity search;
- general loops or callbacks;
- arbitrary dynamic entity-reference storage;
- grid-attached template spawn;
- arbitrary scripting or host/network/storage/device authority.

If the requested mechanic fundamentally requires one of those capabilities and cannot be expressed with a small fixed set of known entity ids, return a `blocked` pressure submission rather than inventing an opcode.

## Budget reminder

The GameSpec JSON hard limit is **16 KB**. A logically correct draft that expands beyond that limit is still invalid for the current instant tier. Prefer compact composition and shared rules over enumerating many near-identical cases when the contract permits it.
