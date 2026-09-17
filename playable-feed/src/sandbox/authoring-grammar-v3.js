export const AUTHORING_GRAMMAR_V3 = Object.freeze({
  status: "experimental",
  runtime: "playloop-2d-v3",
  inheritance: {
    additive: true,
    note: "v3 inherits all supported v0, v1 and v2 authoring syntax; a capability is not absent merely because the v3 grid document does not repeat its older syntax.",
  },
  expressions: {
    literals: ["number", "boolean", "string", "null"],
    variable: { shape: { var: "variable-id" } },
    event: {
      shape: { event: "field" },
      fields: ["x", "y", "dx", "dy", "deltaMs"],
    },
    random: { shape: { random: [0, 1] }, note: "seeded runtime RNG" },
    mathOperators: ["add", "sub", "mul", "div", "min", "max"],
    mathArity: { min: 2, max: 8 },
    entityReadV1: {
      fieldShape: { entity: { ref: "entity-id-or-event-ref", field: "x" } },
      stateShape: { entity: { ref: "entity-id-or-event-ref", state: "state-key" } },
    },
    collectionReadV2: "See GAMESPEC-V2-DRAFT.md for bounded scalar collection reads.",
    gridReadV3: "See GAMESPEC-V3-DRAFT.md for isCellFree, canMoveBy, pathClearToEdge, column and row.",
  },
  conditions: {
    comparisonOperators: ["==", "!=", ">", ">=", "<", "<="],
    comparisonShape: {
      left: "expression",
      op: "==",
      right: "expression",
    },
    combinators: ["all", "any", "not"],
    allShape: { all: ["condition", "condition"] },
    anyShape: { any: ["condition", "condition"] },
    notShape: { not: "condition" },
    note: "Comparisons and all/any/not are condition objects, not expression operators.",
  },
  conditionalActions: {
    ifShape: {
      if: {
        condition: "condition",
        then: ["action"],
        else: ["action"],
      },
    },
    elseOptional: true,
    ruleLevelCondition: true,
    note: "Rules may also carry a top-level condition using the same condition grammar.",
  },
  eventReferences: {
    "$target": ["tap", "pointerDown", "pointerMove", "pointerUp", "entityExit"],
    "$a": ["collision"],
    "$b": ["collision"],
    persistentStorage: false,
    note: "Event references may be read during their event but cannot be stored as scalar variables for later use.",
  },
  gridComposition: {
    knownEntityIds: true,
    dynamicOccupantLookup: false,
    neighborAggregation: false,
    examples: [
      "Compare player next column/row with a known crate id, then use canMoveBy and ordered moveGridBy actions.",
      "Use pathClearToEdge when the mechanic is specifically about an unobstructed lane to a board edge.",
    ],
  },
  budgets: {
    maxSpecBytes: 16384,
    note: "Prefer composition and compact rules; a mechanically correct draft that exceeds this budget is not instant-tier valid.",
  },
});
