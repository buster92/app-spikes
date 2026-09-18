const BUCKETS = 10_000;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RESERVED_EXPOSURE_KEYS = new Set([
  "schema",
  "name",
  "event_id",
  "anon_id",
  "session_id",
  "sequence",
  "ts",
  "session_ms",
  "experiment_context",
  "experiment_id",
  "variant_id",
  "forced",
  "allocation_bucket",
  "variant_bucket",
]);

export const PRODUCT_EXPERIMENTS = Object.freeze({
  onboarding_value_prop_v1: Object.freeze({
    id: "onboarding_value_prop_v1",
    allocation: 1,
    variants: Object.freeze([
      Object.freeze({ id: "control", weight: 1 }),
      Object.freeze({ id: "instant_play", weight: 1 }),
    ]),
  }),
});

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function bucket(value) {
  return stableHash(value) % BUCKETS;
}

function exposureMetadata(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => !RESERVED_EXPOSURE_KEYS.has(key)),
  );
}

function validateDefinition(definition) {
  if (!definition || typeof definition !== "object") throw new TypeError("experiment definition must be an object");
  if (!SAFE_ID.test(definition.id || "")) throw new TypeError("experiment id is invalid");
  if (!Array.isArray(definition.variants) || definition.variants.length < 2) {
    throw new TypeError(`experiment ${definition.id} must declare at least two variants`);
  }

  const seen = new Set();
  let totalWeight = 0;
  for (const variant of definition.variants) {
    if (!variant || typeof variant !== "object" || !SAFE_ID.test(variant.id || "")) {
      throw new TypeError(`experiment ${definition.id} has an invalid variant`);
    }
    if (seen.has(variant.id)) throw new TypeError(`experiment ${definition.id} repeats variant ${variant.id}`);
    seen.add(variant.id);
    if (!Number.isFinite(variant.weight) || variant.weight <= 0) {
      throw new TypeError(`experiment ${definition.id} variant ${variant.id} has invalid weight`);
    }
    totalWeight += variant.weight;
  }

  const allocation = definition.allocation ?? 1;
  if (!Number.isFinite(allocation) || allocation < 0 || allocation > 1) {
    throw new TypeError(`experiment ${definition.id} allocation must be between 0 and 1`);
  }

  return { allocation, totalWeight };
}

export function parseExperimentOverrides(search = "") {
  const overrides = new Map();
  const params = new URLSearchParams(String(search).replace(/^\?/, ""));
  const values = params.getAll("exp").flatMap((value) => value.split(","));

  for (const raw of values) {
    const separator = raw.indexOf(":");
    if (separator <= 0) continue;
    const experimentId = raw.slice(0, separator).trim();
    const variantId = raw.slice(separator + 1).trim();
    if (SAFE_ID.test(experimentId) && SAFE_ID.test(variantId)) overrides.set(experimentId, variantId);
  }
  return overrides;
}

export function assignExperiment(definition, identity, overrideVariant = null) {
  const { allocation, totalWeight } = validateDefinition(definition);
  if (typeof identity !== "string" || identity.length === 0) throw new TypeError("experiment identity is required");

  const forcedVariant = overrideVariant
    ? definition.variants.find((variant) => variant.id === overrideVariant)
    : null;
  if (forcedVariant) {
    return {
      experiment_id: definition.id,
      variant_id: forcedVariant.id,
      assigned: true,
      forced: true,
      allocation_bucket: null,
      variant_bucket: null,
    };
  }

  const allocationBucket = bucket(`${definition.id}:allocation:${identity}`);
  if (allocationBucket >= Math.round(allocation * BUCKETS)) {
    return {
      experiment_id: definition.id,
      variant_id: null,
      assigned: false,
      forced: false,
      allocation_bucket: allocationBucket,
      variant_bucket: null,
    };
  }

  const variantBucket = bucket(`${definition.id}:variant:${identity}`);
  const target = (variantBucket / BUCKETS) * totalWeight;
  let cumulative = 0;
  let selected = definition.variants.at(-1);
  for (const variant of definition.variants) {
    cumulative += variant.weight;
    if (target < cumulative) {
      selected = variant;
      break;
    }
  }

  return {
    experiment_id: definition.id,
    variant_id: selected.id,
    assigned: true,
    forced: false,
    allocation_bucket: allocationBucket,
    variant_bucket: variantBucket,
  };
}

export class ExperimentRegistry {
  constructor({ identity, definitions = PRODUCT_EXPERIMENTS, search = "" } = {}) {
    if (typeof identity !== "string" || identity.length === 0) throw new TypeError("experiment identity is required");
    this.identity = identity;
    this.definitions = new Map();
    this.assignments = new Map();
    this.exposed = new Map();
    this.overrides = parseExperimentOverrides(search);

    for (const definition of Object.values(definitions)) {
      validateDefinition(definition);
      if (this.definitions.has(definition.id)) throw new TypeError(`duplicate experiment ${definition.id}`);
      this.definitions.set(definition.id, definition);
    }
  }

  assignment(experimentId) {
    if (this.assignments.has(experimentId)) return this.assignments.get(experimentId);
    const definition = this.definitions.get(experimentId);
    if (!definition) throw new Error(`unknown experiment ${experimentId}`);
    const assignment = assignExperiment(definition, this.identity, this.overrides.get(experimentId));
    this.assignments.set(experimentId, assignment);
    return assignment;
  }

  expose(experimentId, emit, properties = {}) {
    const assignment = this.assignment(experimentId);
    if (!assignment.assigned) return null;

    if (!this.exposed.has(experimentId)) {
      emit?.("experiment_exposure", {
        ...exposureMetadata(properties),
        experiment_id: assignment.experiment_id,
        variant_id: assignment.variant_id,
        forced: assignment.forced,
        allocation_bucket: assignment.allocation_bucket,
        variant_bucket: assignment.variant_bucket,
      });
      this.exposed.set(experimentId, assignment.variant_id);
    }
    return assignment.variant_id;
  }

  context() {
    return Object.fromEntries(this.exposed.entries());
  }
}
