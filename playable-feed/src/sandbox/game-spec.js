import { ASSET_POLICY, validateNormalizedAssetMetadata } from "./asset-contract.js";

export const RUNTIME_ID = "playloop-2d-v0";

export const HARD_LIMITS = Object.freeze({
  maxSpecBytes: 16 * 1024,
  maxDeclaredAssetBytes: ASSET_POLICY.maxDeclaredAssetBytes,
  maxAssets: ASSET_POLICY.maxAssets,
  maxEntities: 64,
  maxTemplates: 24,
  maxRules: 96,
  maxActionsPerRule: 16,
  maxTimers: 16,
  maxDurationMs: 60_000,
  maxExpressionDepth: 8,
  maxOpsPerStep: 2_000,
  maxStepMs: 50,
});

export const ALLOWED_EVENTS = new Set([
  "start",
  "tick",
  "tap",
  "pointerDown",
  "pointerMove",
  "pointerUp",
  "timer",
  "collision",
  "entityExit",
]);

export const ALLOWED_ACTIONS = new Set([
  "setVar",
  "addVar",
  "setEntity",
  "moveEntity",
  "setVelocity",
  "spawn",
  "destroy",
  "emit",
  "sound",
  "haptic",
  "complete",
  "fail",
  "if",
]);

const ALLOWED_ENTITY_KINDS = new Set(["circle", "rect", "text", "sprite"]);
const ALLOWED_BOUNDS = new Set(["none", "clamp", "bounce", "wrap", "destroy"]);
const ALLOWED_COMPARE = new Set(["==", "!=", ">", ">=", "<", "<="]);
const ALLOWED_MATH = new Set(["add", "sub", "mul", "div", "min", "max"]);
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EVENT_REFS = new Set(["$target", "$a", "$b"]);

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function push(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function validateId(value, path, errors) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    push(errors, path, "must be a lowercase safe id (a-z, 0-9, ., _, -; max 64 chars)");
    return false;
  }
  return true;
}

function validateExpression(expr, path, errors, depth = 0) {
  if (depth > HARD_LIMITS.maxExpressionDepth) {
    push(errors, path, "expression is too deeply nested");
    return;
  }
  if (expr === null || typeof expr === "boolean" || typeof expr === "string" || isFiniteNumber(expr)) return;
  if (!expr || typeof expr !== "object" || Array.isArray(expr)) {
    push(errors, path, "must be a literal or supported expression object");
    return;
  }

  const keys = Object.keys(expr);
  if (keys.length !== 1) {
    push(errors, path, "expression object must contain exactly one operator");
    return;
  }

  const [op] = keys;
  const value = expr[op];
  if (op === "var") {
    validateId(value, `${path}.var`, errors);
    return;
  }
  if (op === "event") {
    if (!new Set(["x", "y", "dx", "dy", "deltaMs"]).has(value)) push(errors, `${path}.event`, "unsupported event field");
    return;
  }
  if (op === "random") {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber) || value[0] > value[1]) {
      push(errors, `${path}.random`, "must be [min,max] finite numbers");
    }
    return;
  }
  if (ALLOWED_MATH.has(op)) {
    if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
      push(errors, `${path}.${op}`, "must contain 2–8 operands");
      return;
    }
    value.forEach((item, index) => validateExpression(item, `${path}.${op}[${index}]`, errors, depth + 1));
    return;
  }
  push(errors, path, `unsupported expression operator ${op}`);
}

function validateCondition(condition, path, errors, depth = 0) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    push(errors, path, "condition must be an object");
    return;
  }
  if (depth > HARD_LIMITS.maxExpressionDepth) {
    push(errors, path, "condition is too deeply nested");
    return;
  }
  if (Array.isArray(condition.all)) {
    condition.all.forEach((child, index) => validateCondition(child, `${path}.all[${index}]`, errors, depth + 1));
    return;
  }
  if (Array.isArray(condition.any)) {
    condition.any.forEach((child, index) => validateCondition(child, `${path}.any[${index}]`, errors, depth + 1));
    return;
  }
  if (condition.not) {
    validateCondition(condition.not, `${path}.not`, errors, depth + 1);
    return;
  }
  if (!ALLOWED_COMPARE.has(condition.op)) {
    push(errors, `${path}.op`, "unsupported comparison operator");
    return;
  }
  validateExpression(condition.left, `${path}.left`, errors, depth + 1);
  validateExpression(condition.right, `${path}.right`, errors, depth + 1);
}

function validateEntityRef(value, path, errors) {
  if (EVENT_REFS.has(value)) return;
  validateId(value, path, errors);
}

function validateEmitData(data, path, errors) {
  if (data === undefined) return;
  if (!isObject(data)) {
    push(errors, path, "must be a flat object");
    return;
  }
  const entries = Object.entries(data);
  if (entries.length > 8) push(errors, path, "may contain at most 8 fields");
  for (const [key, value] of entries) {
    validateId(key, `${path}.${key}`, errors);
    if (value === null) continue;
    if (!["string", "number", "boolean"].includes(typeof value)) {
      push(errors, `${path}.${key}`, "must be a scalar value");
      continue;
    }
    if (typeof value === "number" && !Number.isFinite(value)) push(errors, `${path}.${key}`, "must be a finite number");
    if (typeof value === "string" && value.length > 128) push(errors, `${path}.${key}`, "string exceeds 128 characters");
  }
}

function validateActions(actions, path, errors) {
  if (!Array.isArray(actions)) {
    push(errors, path, "must be an array");
    return;
  }
  if (actions.length > HARD_LIMITS.maxActionsPerRule) push(errors, path, `max ${HARD_LIMITS.maxActionsPerRule} actions per rule`);

  actions.forEach((action, index) => {
    const actionPath = `${path}[${index}]`;
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      push(errors, actionPath, "action must be an object");
      return;
    }
    const keys = Object.keys(action);
    if (keys.length !== 1 || !ALLOWED_ACTIONS.has(keys[0])) {
      push(errors, actionPath, "must contain exactly one allowed action");
      return;
    }
    const [type] = keys;
    const value = action[type];

    switch (type) {
      case "setVar":
      case "addVar":
        validateId(value?.name, `${actionPath}.${type}.name`, errors);
        validateExpression(value?.value, `${actionPath}.${type}.value`, errors);
        break;
      case "setEntity":
      case "moveEntity":
      case "setVelocity":
        validateEntityRef(value?.entity, `${actionPath}.${type}.entity`, errors);
        for (const key of ["x", "y", "vx", "vy", "rotation", "opacity"]) {
          if (value?.[key] !== undefined) validateExpression(value[key], `${actionPath}.${type}.${key}`, errors);
        }
        break;
      case "spawn":
        validateId(value?.template, `${actionPath}.spawn.template`, errors);
        if (value?.id !== undefined) validateId(value.id, `${actionPath}.spawn.id`, errors);
        for (const key of ["x", "y", "vx", "vy"]) {
          if (value?.[key] !== undefined) validateExpression(value[key], `${actionPath}.spawn.${key}`, errors);
        }
        break;
      case "destroy":
        validateEntityRef(value?.entity, `${actionPath}.destroy.entity`, errors);
        break;
      case "emit":
        validateId(value?.name, `${actionPath}.emit.name`, errors);
        validateEmitData(value?.data, `${actionPath}.emit.data`, errors);
        break;
      case "sound":
        validateId(value?.asset, `${actionPath}.sound.asset`, errors);
        if (value?.volume !== undefined && (!isFiniteNumber(value.volume) || value.volume < 0 || value.volume > 1)) {
          push(errors, `${actionPath}.sound.volume`, "must be a finite number from 0-1");
        }
        break;
      case "haptic":
        if (!Array.isArray(value?.pattern) || value.pattern.length > 6 || !value.pattern.every((v) => Number.isInteger(v) && v >= 0 && v <= 100)) {
          push(errors, `${actionPath}.haptic.pattern`, "must be <=6 integers from 0–100ms");
        }
        break;
      case "complete":
      case "fail":
        if (value?.score !== undefined) validateExpression(value.score, `${actionPath}.${type}.score`, errors);
        if (value?.detail !== undefined && (typeof value.detail !== "string" || value.detail.length > 160)) {
          push(errors, `${actionPath}.${type}.detail`, "must be a string of at most 160 characters");
        }
        break;
      case "if":
        validateCondition(value?.condition, `${actionPath}.if.condition`, errors);
        if (!Array.isArray(value?.then)) push(errors, `${actionPath}.if.then`, "must be an array");
        else validateActions(value.then, `${actionPath}.if.then`, errors);
        if (value?.else !== undefined) validateActions(value.else, `${actionPath}.if.else`, errors);
        break;
      default:
        break;
    }
  });
}

function validateSourceRect(entity, path, errors) {
  const keys = ["sourceX", "sourceY", "sourceWidth", "sourceHeight"];
  const present = keys.filter((key) => entity[key] !== undefined);
  if (!present.length) return;
  if (present.length !== keys.length) {
    push(errors, path, "source rectangle requires sourceX/sourceY/sourceWidth/sourceHeight together");
    return;
  }
  for (const key of ["sourceX", "sourceY"]) {
    if (!Number.isInteger(entity[key]) || entity[key] < 0) push(errors, `${path}.${key}`, "must be a non-negative integer");
  }
  for (const key of ["sourceWidth", "sourceHeight"]) {
    if (!Number.isInteger(entity[key]) || entity[key] < 1) push(errors, `${path}.${key}`, "must be a positive integer");
  }
}

function validateEntity(entity, path, errors, template = false) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    push(errors, path, "must be an object");
    return;
  }
  if (!template) validateId(entity.id, `${path}.id`, errors);
  if (!ALLOWED_ENTITY_KINDS.has(entity.kind)) push(errors, `${path}.kind`, "must be circle, rect, text, or sprite");
  if (entity.tags !== undefined) {
    if (!Array.isArray(entity.tags) || entity.tags.length > 8) push(errors, `${path}.tags`, "must be an array of at most 8 tags");
    else entity.tags.forEach((tag, index) => validateId(tag, `${path}.tags[${index}]`, errors));
  }
  for (const key of ["x", "y", "vx", "vy", "rotation"]) {
    if (entity[key] !== undefined && !isFiniteNumber(entity[key])) push(errors, `${path}.${key}`, "must be a finite number");
  }
  if (entity.width !== undefined && (!isFiniteNumber(entity.width) || entity.width <= 0)) {
    push(errors, `${path}.width`, "must be a positive finite number");
  }
  if (entity.height !== undefined && (!isFiniteNumber(entity.height) || entity.height <= 0)) {
    push(errors, `${path}.height`, "must be a positive finite number");
  }
  if (entity.radius !== undefined && (!isFiniteNumber(entity.radius) || entity.radius < 0)) {
    push(errors, `${path}.radius`, "must be a non-negative finite number");
  }
  if (entity.opacity !== undefined && (!isFiniteNumber(entity.opacity) || entity.opacity < 0 || entity.opacity > 1)) {
    push(errors, `${path}.opacity`, "must be a finite number from 0-1");
  }
  if (entity.kind === "sprite") {
    validateId(entity.asset, `${path}.asset`, errors);
    if (!isFiniteNumber(entity.width) || entity.width <= 0) push(errors, `${path}.width`, "sprite width must be > 0");
    if (!isFiniteNumber(entity.height) || entity.height <= 0) push(errors, `${path}.height`, "sprite height must be > 0");
  }
  validateSourceRect(entity, path, errors);
  if (entity.bounds !== undefined && !ALLOWED_BOUNDS.has(entity.bounds)) push(errors, `${path}.bounds`, "unsupported bounds behavior");
  if (entity.color !== undefined && (typeof entity.color !== "string" || entity.color.length > 64)) {
    push(errors, `${path}.color`, "must be a string of at most 64 characters");
  }
  if (entity.text !== undefined && (typeof entity.text !== "string" || entity.text.length > 256)) {
    push(errors, `${path}.text`, "must be a string of at most 256 characters");
  }
  for (const key of ["collidable", "interactive"]) {
    if (entity[key] !== undefined && typeof entity[key] !== "boolean") push(errors, `${path}.${key}`, "must be a boolean");
  }
}

export function validateGameSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return { ok: false, errors: ["spec: must be an object"] };

  const specBytes = byteLength(spec);
  if (specBytes > HARD_LIMITS.maxSpecBytes) push(errors, "spec", `JSON is ${specBytes} bytes; max ${HARD_LIMITS.maxSpecBytes}`);
  if (spec.schemaVersion !== 1) push(errors, "schemaVersion", "must be 1");
  if (spec.runtime !== RUNTIME_ID) push(errors, "runtime", `must be ${RUNTIME_ID}`);
  validateId(spec.id, "id", errors);
  if (typeof spec.title !== "string" || spec.title.length < 1 || spec.title.length > 80) push(errors, "title", "must be 1–80 characters");

  const width = spec.canvas?.width;
  const height = spec.canvas?.height;
  if (!Number.isInteger(width) || width < 160 || width > 1080) push(errors, "canvas.width", "must be an integer from 160–1080");
  if (!Number.isInteger(height) || height < 240 || height > 1920) push(errors, "canvas.height", "must be an integer from 240–1920");
  if (typeof spec.canvas?.background !== "string" || spec.canvas.background.length > 64) {
    push(errors, "canvas.background", "must be a string of at most 64 characters");
  }

  const variables = spec.variables || {};
  if (!variables || typeof variables !== "object" || Array.isArray(variables) || Object.keys(variables).length > 32) {
    push(errors, "variables", "must be an object with at most 32 values");
  } else {
    for (const [name, value] of Object.entries(variables)) {
      validateId(name, `variables.${name}`, errors);
      if (!["number", "boolean", "string"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) {
        push(errors, `variables.${name}`, "must be a finite number, boolean, or string");
      }
      if (typeof value === "string" && value.length > 128) push(errors, `variables.${name}`, "string exceeds 128 characters");
    }
  }

  const assets = spec.assets || [];
  if (!Array.isArray(assets)) push(errors, "assets", "must be an array");
  else {
    if (assets.length > HARD_LIMITS.maxAssets) push(errors, "assets", `max ${HARD_LIMITS.maxAssets} assets`);
    let declaredBytes = 0;
    assets.forEach((asset, index) => {
      validateId(asset?.id, `assets[${index}].id`, errors);
      errors.push(...validateNormalizedAssetMetadata(asset, `assets[${index}]`));
      if (Number.isInteger(asset?.bytes) && asset.bytes >= 0) declaredBytes += asset.bytes;
    });
    if (declaredBytes > HARD_LIMITS.maxDeclaredAssetBytes) push(errors, "assets", `declared asset bytes ${declaredBytes} exceed ${HARD_LIMITS.maxDeclaredAssetBytes}`);
  }

  const templates = spec.templates || {};
  if (!templates || typeof templates !== "object" || Array.isArray(templates)) push(errors, "templates", "must be an object");
  else {
    if (Object.keys(templates).length > HARD_LIMITS.maxTemplates) push(errors, "templates", `max ${HARD_LIMITS.maxTemplates} templates`);
    for (const [id, template] of Object.entries(templates)) {
      validateId(id, `templates.${id}`, errors);
      validateEntity(template, `templates.${id}`, errors, true);
    }
  }

  const entities = spec.entities || [];
  if (!Array.isArray(entities)) push(errors, "entities", "must be an array");
  else {
    if (entities.length > HARD_LIMITS.maxEntities) push(errors, "entities", `max ${HARD_LIMITS.maxEntities} starting entities`);
    const ids = new Set();
    entities.forEach((entity, index) => {
      validateEntity(entity, `entities[${index}]`, errors);
      if (ids.has(entity?.id)) push(errors, `entities[${index}].id`, "duplicate entity id");
      ids.add(entity?.id);
    });
  }

  const timers = spec.timers || [];
  if (!Array.isArray(timers)) push(errors, "timers", "must be an array");
  else {
    if (timers.length > HARD_LIMITS.maxTimers) push(errors, "timers", `max ${HARD_LIMITS.maxTimers} timers`);
    timers.forEach((timer, index) => {
      validateId(timer?.id, `timers[${index}].id`, errors);
      if (!Number.isInteger(timer?.afterMs) || timer.afterMs < 0 || timer.afterMs > HARD_LIMITS.maxDurationMs) push(errors, `timers[${index}].afterMs`, "must be a valid delay");
      if (timer?.everyMs !== undefined && (!Number.isInteger(timer.everyMs) || timer.everyMs < 50 || timer.everyMs > HARD_LIMITS.maxDurationMs)) {
        push(errors, `timers[${index}].everyMs`, "must be 50ms–60s");
      }
    });
  }

  const rules = spec.rules;
  if (!Array.isArray(rules)) push(errors, "rules", "must be an array");
  else {
    if (rules.length > HARD_LIMITS.maxRules) push(errors, "rules", `max ${HARD_LIMITS.maxRules} rules`);
    rules.forEach((rule, index) => {
      const path = `rules[${index}]`;
      if (!ALLOWED_EVENTS.has(rule?.on)) push(errors, `${path}.on`, "unsupported event");
      if (rule?.timerId !== undefined) validateId(rule.timerId, `${path}.timerId`, errors);
      if (rule?.targetTag !== undefined) validateId(rule.targetTag, `${path}.targetTag`, errors);
      if (rule?.aTag !== undefined) validateId(rule.aTag, `${path}.aTag`, errors);
      if (rule?.bTag !== undefined) validateId(rule.bTag, `${path}.bTag`, errors);
      if (rule?.condition !== undefined) validateCondition(rule.condition, `${path}.condition`, errors);
      validateActions(rule?.actions, `${path}.actions`, errors);
    });
  }

  const metricAssets = Array.isArray(spec.assets) ? spec.assets : [];
  return {
    ok: errors.length === 0,
    errors,
    metrics: {
      specBytes,
      declaredAssetBytes: metricAssets.reduce((sum, asset) => sum + Number(asset?.bytes || 0), 0),
      startingEntities: Array.isArray(spec.entities) ? spec.entities.length : 0,
      rules: Array.isArray(spec.rules) ? spec.rules.length : 0,
      timers: Array.isArray(spec.timers) ? spec.timers.length : 0,
    },
  };
}

export function packageProfile(spec) {
  const validation = validateGameSpec(spec);
  const declaredAssetBytes = validation.metrics?.declaredAssetBytes || 0;
  const specBytes = validation.metrics?.specBytes || byteLength(spec);
  const totalDeclaredBytes = specBytes + declaredAssetBytes;
  return {
    ...validation,
    totalDeclaredBytes,
    instantEligible: validation.ok && totalDeclaredBytes <= 300 * 1024,
    zeroAsset: declaredAssetBytes === 0,
  };
}