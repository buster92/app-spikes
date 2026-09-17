import { HARD_LIMITS, RUNTIME_ID, validateGameSpec } from "./game-spec.js";
import { validatePublicationPolicy } from "./publication-policy.js";

export const RUNTIME_V1_ID = "playloop-2d-v1";
export const V1_ENTITY_FIELDS = Object.freeze([
  "x", "y", "vx", "vy", "width", "height", "radius", "rotation", "opacity",
]);
export const V1_STATE_ACTIONS = Object.freeze(["setEntityState", "addEntityState"]);
export const V1_LIMITS = Object.freeze({
  maxStateKeysPerEntity: 8,
  maxStateStringLength: 128,
});

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EVENT_REFS = new Set(["$target", "$a", "$b"]);
const TARGET_EVENTS = new Set(["tap", "pointerDown", "pointerMove", "pointerUp", "entityExit"]);
const FIELD_SET = new Set(V1_ENTITY_FIELDS);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scalarStateValue(value) {
  return value === null
    || typeof value === "boolean"
    || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function validRefForEvent(ref, eventName, initialIds) {
  if (typeof ref !== "string") return false;
  if (!EVENT_REFS.has(ref)) return initialIds.has(ref);
  if (ref === "$target") return TARGET_EVENTS.has(eventName);
  return eventName === "collision";
}

function sanitizeExpression(value) {
  if (Array.isArray(value)) return value.map(sanitizeExpression);
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "entity" && isObject(value.entity) && typeof value.entity.ref === "string") {
    return 0;
  }
  const output = {};
  for (const [key, child] of Object.entries(value)) output[key] = sanitizeExpression(child);
  return output;
}

function sanitizeActions(actions) {
  return (actions || []).map((action) => {
    if (!isObject(action)) return action;
    if (Object.hasOwn(action, "setEntityState") || Object.hasOwn(action, "addEntityState")) {
      return { setVar: { name: "v1noop", value: 0 } };
    }
    if (Object.hasOwn(action, "if") && isObject(action.if)) {
      return {
        if: {
          condition: sanitizeExpression(action.if.condition),
          then: sanitizeActions(action.if.then || []),
          ...(action.if.else === undefined ? {} : { else: sanitizeActions(action.if.else || []) }),
        },
      };
    }
    return sanitizeExpression(action);
  });
}

export function downgradeV1ForV0Validation(spec) {
  const copy = clone(spec) || {};
  copy.runtime = RUNTIME_ID;
  for (const entity of copy.entities || []) delete entity.state;
  for (const template of Object.values(copy.templates || {})) delete template.state;
  for (const rule of copy.rules || []) {
    if (rule.condition !== undefined) rule.condition = sanitizeExpression(rule.condition);
    rule.actions = sanitizeActions(rule.actions || []);
  }
  return copy;
}

function validateStateMap(state, path, errors) {
  if (state === undefined) return;
  if (!isObject(state)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  const entries = Object.entries(state);
  if (entries.length > V1_LIMITS.maxStateKeysPerEntity) {
    errors.push(`${path}: max ${V1_LIMITS.maxStateKeysPerEntity} scalar state keys`);
  }
  for (const [key, value] of entries) {
    if (!SAFE_ID.test(key)) errors.push(`${path}.${key}: invalid state key`);
    if (!scalarStateValue(value)) errors.push(`${path}.${key}: state values must be scalar`);
    if (typeof value === "string" && value.length > V1_LIMITS.maxStateStringLength) {
      errors.push(`${path}.${key}: string exceeds ${V1_LIMITS.maxStateStringLength} characters`);
    }
  }
}

function validateEntityRead(expression, eventName, initialIds, path, errors) {
  const read = expression.entity;
  if (!isObject(read)) {
    errors.push(`${path}.entity: must be an object`);
    return;
  }
  const keys = Object.keys(read);
  const allowed = new Set(["ref", "field", "state"]);
  for (const key of keys) if (!allowed.has(key)) errors.push(`${path}.entity.${key}: unknown field`);
  if (!validRefForEvent(read.ref, eventName, initialIds)) {
    errors.push(`${path}.entity.ref: '${read.ref}' is not available for '${eventName}'`);
  }
  const hasField = read.field !== undefined;
  const hasState = read.state !== undefined;
  if (hasField === hasState) {
    errors.push(`${path}.entity: provide exactly one of field or state`);
    return;
  }
  if (hasField && !FIELD_SET.has(read.field)) errors.push(`${path}.entity.field: unsupported field '${read.field}'`);
  if (hasState && (typeof read.state !== "string" || !SAFE_ID.test(read.state))) errors.push(`${path}.entity.state: invalid state key`);
}

function walkExpressions(value, eventName, initialIds, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkExpressions(item, eventName, initialIds, `${path}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "entity") {
    validateEntityRead(value, eventName, initialIds, path, errors);
    return;
  }
  for (const [key, child] of Object.entries(value)) walkExpressions(child, eventName, initialIds, `${path}.${key}`, errors);
}

function validateStateAction(action, eventName, initialIds, path, errors) {
  const type = Object.hasOwn(action, "setEntityState") ? "setEntityState" : "addEntityState";
  const payload = action[type];
  if (!isObject(payload)) {
    errors.push(`${path}.${type}: must be an object`);
    return;
  }
  const allowed = new Set(["entity", "key", "value"]);
  for (const key of Object.keys(payload)) if (!allowed.has(key)) errors.push(`${path}.${type}.${key}: unknown field`);
  if (!validRefForEvent(payload.entity, eventName, initialIds)) {
    errors.push(`${path}.${type}.entity: '${payload.entity}' is not available for '${eventName}'`);
  }
  if (typeof payload.key !== "string" || !SAFE_ID.test(payload.key)) errors.push(`${path}.${type}.key: invalid state key`);
  walkExpressions(payload.value, eventName, initialIds, `${path}.${type}.value`, errors);
}

function walkActions(actions, eventName, initialIds, path, errors) {
  if (!Array.isArray(actions)) return;
  actions.forEach((action, index) => {
    const actionPath = `${path}[${index}]`;
    if (!isObject(action)) return;
    if (Object.hasOwn(action, "setEntityState") || Object.hasOwn(action, "addEntityState")) {
      if (Object.keys(action).length !== 1) errors.push(`${actionPath}: v1 state action must be the only action key`);
      validateStateAction(action, eventName, initialIds, actionPath, errors);
      return;
    }
    if (Object.hasOwn(action, "if") && isObject(action.if)) {
      walkExpressions(action.if.condition, eventName, initialIds, `${actionPath}.if.condition`, errors);
      walkActions(action.if.then || [], eventName, initialIds, `${actionPath}.if.then`, errors);
      walkActions(action.if.else || [], eventName, initialIds, `${actionPath}.if.else`, errors);
      return;
    }
    walkExpressions(action, eventName, initialIds, actionPath, errors);
  });
}

export function validateGameSpecV1(spec) {
  const errors = [];
  if (!isObject(spec)) return { ok: false, errors: ["spec: must be an object"] };
  if (spec.runtime !== RUNTIME_V1_ID) errors.push(`runtime: must be ${RUNTIME_V1_ID}`);
  const originalBytes = byteLength(spec);
  if (originalBytes > HARD_LIMITS.maxSpecBytes) errors.push(`spec: JSON is ${originalBytes} bytes; max ${HARD_LIMITS.maxSpecBytes}`);

  const downgraded = downgradeV1ForV0Validation(spec);
  const base = validateGameSpec(downgraded);
  errors.push(...base.errors.filter((message) => !message.startsWith("spec: JSON is ")));

  const initialIds = new Set((spec.entities || []).map((entity) => entity?.id).filter(Boolean));
  (spec.entities || []).forEach((entity, index) => validateStateMap(entity?.state, `entities[${index}].state`, errors));
  for (const [id, template] of Object.entries(spec.templates || {})) validateStateMap(template?.state, `templates.${id}.state`, errors);

  (spec.rules || []).forEach((rule, index) => {
    const eventName = rule?.on;
    if (rule?.condition !== undefined) walkExpressions(rule.condition, eventName, initialIds, `rules[${index}].condition`, errors);
    walkActions(rule?.actions || [], eventName, initialIds, `rules[${index}].actions`, errors);
  });

  return { ok: errors.length === 0, errors };
}

export function validatePublicationPolicyV1(spec) {
  const validation = validateGameSpecV1(spec);
  if (!validation.ok) return { ok: false, errors: [...validation.errors], warnings: [] };
  const base = validatePublicationPolicy(downgradeV1ForV0Validation(spec));
  return {
    ok: base.ok,
    errors: [...base.errors],
    warnings: [...base.warnings],
    metrics: {
      ...(base.metrics || {}),
      runtime: RUNTIME_V1_ID,
      specBytes: byteLength(spec),
    },
  };
}

export function packageProfileV1(spec) {
  const validation = validateGameSpecV1(spec);
  const specBytes = byteLength(spec);
  const declaredAssetBytes = (spec?.assets || []).reduce((sum, asset) => sum + Number(asset?.bytes || 0), 0);
  const combinedBytes = specBytes + declaredAssetBytes;
  return {
    ok: validation.ok,
    errors: validation.errors,
    instantEligible: validation.ok && combinedBytes <= 300 * 1024,
    zeroAsset: declaredAssetBytes === 0,
    metrics: {
      specBytes,
      declaredAssetBytes,
      combinedBytes,
      entities: spec?.entities?.length || 0,
      templates: Object.keys(spec?.templates || {}).length,
      rules: spec?.rules?.length || 0,
      timers: spec?.timers?.length || 0,
      assets: spec?.assets?.length || 0,
    },
  };
}
