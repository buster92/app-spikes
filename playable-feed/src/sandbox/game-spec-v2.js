import { HARD_LIMITS } from "./game-spec.js";
import {
  RUNTIME_V1_ID,
  isV1ScalarStateValue,
  validateGameSpecV1,
  validatePublicationPolicyV1,
} from "./game-spec-v1.js";

export const RUNTIME_V2_ID = "playloop-2d-v2";
export const V2_COLLECTION_ACTIONS = Object.freeze([
  "pushCollection",
  "setCollectionItem",
  "removeCollectionAt",
  "clearCollection",
  "shuffleCollection",
]);
export const V2_COLLECTION_OPS = Object.freeze(["length", "at", "first", "last"]);
export const V2_LIMITS = Object.freeze({
  maxCollections: 8,
  maxItemsPerCollection: 16,
  maxCollectionStringLength: 128,
});

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const COLLECTION_ACTION_SET = new Set(V2_COLLECTION_ACTIONS);
const COLLECTION_OP_SET = new Set(V2_COLLECTION_OPS);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCollectionRead(value) {
  return isObject(value)
    && Object.keys(value).length === 1
    && Object.hasOwn(value, "collection");
}

function sanitizeExpression(value) {
  if (Array.isArray(value)) return value.map(sanitizeExpression);
  if (!isObject(value)) return value;
  if (isCollectionRead(value)) return 0;
  const output = {};
  for (const [key, child] of Object.entries(value)) output[key] = sanitizeExpression(child);
  return output;
}

function sanitizeActions(actions) {
  return (actions || []).map((action) => {
    if (!isObject(action)) return action;
    const keys = Object.keys(action);
    if (keys.length === 1 && COLLECTION_ACTION_SET.has(keys[0])) {
      return { setVar: { name: "v2noop", value: 0 } };
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

export function downgradeV2ForV1Validation(spec) {
  const copy = clone(spec) || {};
  copy.runtime = RUNTIME_V1_ID;
  delete copy.collections;
  for (const rule of copy.rules || []) {
    if (rule.condition !== undefined) rule.condition = sanitizeExpression(rule.condition);
    rule.actions = sanitizeActions(rule.actions || []);
  }
  return copy;
}

function validateCollections(collections, errors) {
  if (collections === undefined) return new Set();
  if (!isObject(collections)) {
    errors.push("collections: must be an object");
    return new Set();
  }
  const entries = Object.entries(collections);
  if (entries.length > V2_LIMITS.maxCollections) {
    errors.push(`collections: max ${V2_LIMITS.maxCollections} collections`);
  }
  const names = new Set();
  for (const [name, items] of entries) {
    if (!SAFE_ID.test(name)) {
      errors.push(`collections.${name}: invalid collection id`);
      continue;
    }
    names.add(name);
    if (!Array.isArray(items)) {
      errors.push(`collections.${name}: must be an array`);
      continue;
    }
    if (items.length > V2_LIMITS.maxItemsPerCollection) {
      errors.push(`collections.${name}: max ${V2_LIMITS.maxItemsPerCollection} items`);
    }
    items.forEach((item, index) => {
      if (!isV1ScalarStateValue(item)) {
        errors.push(`collections.${name}[${index}]: collection items must be scalar`);
      }
      if (typeof item === "string" && item.length > V2_LIMITS.maxCollectionStringLength) {
        errors.push(`collections.${name}[${index}]: string exceeds ${V2_LIMITS.maxCollectionStringLength} characters`);
      }
    });
  }
  return names;
}

function validateCollectionRead(expression, collectionNames, path, errors) {
  const read = expression.collection;
  if (!isObject(read)) {
    errors.push(`${path}.collection: must be an object`);
    return;
  }
  const allowed = new Set(["name", "op", "index"]);
  for (const key of Object.keys(read)) if (!allowed.has(key)) errors.push(`${path}.collection.${key}: unknown field`);
  if (typeof read.name !== "string" || !SAFE_ID.test(read.name)) {
    errors.push(`${path}.collection.name: invalid collection id`);
  } else if (!collectionNames.has(read.name)) {
    errors.push(`${path}.collection.name: unknown collection '${read.name}'`);
  }
  if (!COLLECTION_OP_SET.has(read.op)) {
    errors.push(`${path}.collection.op: unsupported collection operation '${read.op}'`);
    return;
  }
  if (read.op === "at") {
    if (!Object.hasOwn(read, "index")) errors.push(`${path}.collection.index: is required for 'at'`);
  } else if (Object.hasOwn(read, "index")) {
    errors.push(`${path}.collection.index: only valid for 'at'`);
  }
}

function walkExpressions(value, collectionNames, path, errors, depth = 0) {
  if (depth > HARD_LIMITS.maxExpressionDepth) {
    errors.push(`${path}: expression is too deeply nested`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkExpressions(item, collectionNames, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (!isObject(value)) return;
  if (isCollectionRead(value)) {
    validateCollectionRead(value, collectionNames, path, errors);
    const read = value.collection;
    if (read?.op === "at" && Object.hasOwn(read, "index")) {
      walkExpressions(read.index, collectionNames, `${path}.collection.index`, errors, depth + 1);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkExpressions(child, collectionNames, `${path}.${key}`, errors, depth + 1);
  }
}

function validateCollectionAction(action, type, collectionNames, path, errors) {
  const payload = action[type];
  if (!isObject(payload)) {
    errors.push(`${path}.${type}: must be an object`);
    return;
  }
  const allowedByType = {
    pushCollection: new Set(["name", "value"]),
    setCollectionItem: new Set(["name", "index", "value"]),
    removeCollectionAt: new Set(["name", "index"]),
    clearCollection: new Set(["name"]),
    shuffleCollection: new Set(["name"]),
  };
  const allowed = allowedByType[type];
  for (const key of Object.keys(payload)) if (!allowed.has(key)) errors.push(`${path}.${type}.${key}: unknown field`);

  if (typeof payload.name !== "string" || !SAFE_ID.test(payload.name)) {
    errors.push(`${path}.${type}.name: invalid collection id`);
  } else if (!collectionNames.has(payload.name)) {
    errors.push(`${path}.${type}.name: unknown collection '${payload.name}'`);
  }

  if (["pushCollection", "setCollectionItem"].includes(type)) {
    if (!Object.hasOwn(payload, "value")) errors.push(`${path}.${type}.value: is required`);
    else walkExpressions(payload.value, collectionNames, `${path}.${type}.value`, errors);
  }
  if (["setCollectionItem", "removeCollectionAt"].includes(type)) {
    if (!Object.hasOwn(payload, "index")) errors.push(`${path}.${type}.index: is required`);
    else walkExpressions(payload.index, collectionNames, `${path}.${type}.index`, errors);
  }
}

function walkActions(actions, collectionNames, path, errors) {
  if (!Array.isArray(actions)) return;
  actions.forEach((action, index) => {
    const actionPath = `${path}[${index}]`;
    if (!isObject(action)) return;
    const keys = Object.keys(action);
    if (keys.length === 1 && COLLECTION_ACTION_SET.has(keys[0])) {
      validateCollectionAction(action, keys[0], collectionNames, actionPath, errors);
      return;
    }
    if (keys.some((key) => COLLECTION_ACTION_SET.has(key))) {
      errors.push(`${actionPath}: v2 collection action must be the only action key`);
      return;
    }
    if (Object.hasOwn(action, "if") && isObject(action.if)) {
      walkExpressions(action.if.condition, collectionNames, `${actionPath}.if.condition`, errors);
      walkActions(action.if.then || [], collectionNames, `${actionPath}.if.then`, errors);
      walkActions(action.if.else || [], collectionNames, `${actionPath}.if.else`, errors);
      return;
    }
    walkExpressions(action, collectionNames, actionPath, errors);
  });
}

export function validateGameSpecV2(spec) {
  const errors = [];
  if (!isObject(spec)) return { ok: false, errors: ["spec: must be an object"] };
  if (spec.runtime !== RUNTIME_V2_ID) errors.push(`runtime: must be ${RUNTIME_V2_ID}`);
  const originalBytes = byteLength(spec);
  if (originalBytes > HARD_LIMITS.maxSpecBytes) errors.push(`spec: JSON is ${originalBytes} bytes; max ${HARD_LIMITS.maxSpecBytes}`);

  const downgraded = downgradeV2ForV1Validation(spec);
  const base = validateGameSpecV1(downgraded);
  errors.push(...base.errors.filter((message) => !message.startsWith("spec: JSON is ")));

  const collectionNames = validateCollections(spec.collections, errors);
  (spec.rules || []).forEach((rule, index) => {
    if (rule?.condition !== undefined) walkExpressions(rule.condition, collectionNames, `rules[${index}].condition`, errors);
    walkActions(rule?.actions || [], collectionNames, `rules[${index}].actions`, errors);
  });

  return { ok: errors.length === 0, errors };
}

export function validatePublicationPolicyV2(spec) {
  const validation = validateGameSpecV2(spec);
  if (!validation.ok) return { ok: false, errors: [...validation.errors], warnings: [] };
  const base = validatePublicationPolicyV1(downgradeV2ForV1Validation(spec));
  return {
    ok: base.ok,
    errors: [...base.errors],
    warnings: [...base.warnings],
    metrics: {
      ...(base.metrics || {}),
      runtime: RUNTIME_V2_ID,
      specBytes: byteLength(spec),
      collections: Object.keys(spec.collections || {}).length,
      collectionItems: Object.values(spec.collections || {}).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0),
    },
  };
}

export function packageProfileV2(spec) {
  const validation = validateGameSpecV2(spec);
  const specBytes = byteLength(spec);
  const declaredAssetBytes = (spec?.assets || []).reduce((sum, asset) => sum + Number(asset?.bytes || 0), 0);
  const combinedBytes = specBytes + declaredAssetBytes;
  const collectionItems = Object.values(spec?.collections || {}).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
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
      collections: Object.keys(spec?.collections || {}).length,
      collectionItems,
    },
  };
}
