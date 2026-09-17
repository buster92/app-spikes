const TOP_LEVEL_KEYS = new Set(["schemaVersion", "runtime", "id", "title", "canvas", "variables", "assets", "templates", "entities", "timers", "rules"]);
const CANVAS_KEYS = new Set(["width", "height", "background"]);
const ASSET_KEYS = new Set(["id", "kind", "ref", "bytes", "mime", "width", "height"]);
const ENTITY_KEYS = new Set(["id", "kind", "tags", "x", "y", "vx", "vy", "width", "height", "radius", "rotation", "opacity", "color", "text", "bounds", "asset"]);
const TEMPLATE_KEYS = new Set([...ENTITY_KEYS].filter((key) => key !== "id"));
const TIMER_KEYS = new Set(["id", "afterMs", "everyMs"]);
const RULE_KEYS = new Set(["on", "timerId", "targetTag", "aTag", "bTag", "condition", "actions"]);
const EVENT_ENTITY_REFS = new Set(["$target", "$a", "$b"]);
const TARGET_EVENTS = new Set(["tap", "pointerDown", "pointerMove", "pointerUp", "entityExit"]);

const ACTION_PAYLOAD_KEYS = Object.freeze({
  setVar: new Set(["name", "value"]),
  addVar: new Set(["name", "value"]),
  setEntity: new Set(["entity", "x", "y", "vx", "vy", "rotation", "opacity"]),
  moveEntity: new Set(["entity", "x", "y", "vx", "vy", "rotation", "opacity"]),
  setVelocity: new Set(["entity", "x", "y", "vx", "vy", "rotation", "opacity"]),
  spawn: new Set(["template", "id", "x", "y", "vx", "vy"]),
  destroy: new Set(["entity"]),
  emit: new Set(["name", "data"]),
  sound: new Set(["asset", "volume"]),
  haptic: new Set(["pattern"]),
  complete: new Set(["score", "detail"]),
  fail: new Set(["score", "detail"]),
  if: new Set(["condition", "then", "else"]),
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(object, allowed, path, errors) {
  if (!isObject(object)) return;
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field is not allowed in a published GameSpec`);
  }
}

function walkExpression(expr, path, errors) {
  if (!isObject(expr)) return;
  const keys = Object.keys(expr);
  if (keys.length !== 1) return;
  const op = keys[0];
  if (["var", "event", "random"].includes(op)) return;
  if (["add", "sub", "mul", "div", "min", "max"].includes(op) && Array.isArray(expr[op])) {
    expr[op].forEach((child, index) => walkExpression(child, `${path}.${op}[${index}]`, errors));
  }
}

function walkCondition(condition, path, errors) {
  if (!isObject(condition)) return;
  if (Array.isArray(condition.all)) {
    unknownKeys(condition, new Set(["all"]), path, errors);
    condition.all.forEach((child, index) => walkCondition(child, `${path}.all[${index}]`, errors));
    return;
  }
  if (Array.isArray(condition.any)) {
    unknownKeys(condition, new Set(["any"]), path, errors);
    condition.any.forEach((child, index) => walkCondition(child, `${path}.any[${index}]`, errors));
    return;
  }
  if (condition.not !== undefined) {
    unknownKeys(condition, new Set(["not"]), path, errors);
    walkCondition(condition.not, `${path}.not`, errors);
    return;
  }
  unknownKeys(condition, new Set(["left", "op", "right"]), path, errors);
  walkExpression(condition.left, `${path}.left`, errors);
  walkExpression(condition.right, `${path}.right`, errors);
}

function validateEmitData(data, path, errors) {
  if (data === undefined) return;
  if (!isObject(data)) {
    errors.push(`${path}: emit.data must be a flat object`);
    return;
  }
  const entries = Object.entries(data);
  if (entries.length > 8) errors.push(`${path}: emit.data may contain at most 8 fields`);
  for (const [key, value] of entries) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(key)) errors.push(`${path}.${key}: invalid semantic-event field name`);
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      errors.push(`${path}.${key}: emit.data values must be scalar`);
    }
    if (typeof value === "string" && value.length > 128) errors.push(`${path}.${key}: string exceeds 128 characters`);
    if (typeof value === "number" && !Number.isFinite(value)) errors.push(`${path}.${key}: number must be finite`);
  }
}

function collectFixedSpawnIds(actions, output = new Set()) {
  for (const action of actions || []) {
    if (!isObject(action)) continue;
    if (isObject(action.spawn) && typeof action.spawn.id === "string") output.add(action.spawn.id);
    if (isObject(action.if)) {
      collectFixedSpawnIds(action.if.then, output);
      collectFixedSpawnIds(action.if.else, output);
    }
  }
  return output;
}

function validateEntityRef(ref, ruleEvent, knownEntityIds, path, errors) {
  if (typeof ref !== "string") return;
  if (!EVENT_ENTITY_REFS.has(ref)) {
    if (!knownEntityIds.has(ref)) errors.push(`${path}: references unknown entity '${ref}'`);
    return;
  }
  if (ref === "$target" && !TARGET_EVENTS.has(ruleEvent)) {
    errors.push(`${path}: $target is not available for '${ruleEvent}' rules`);
  }
  if ((ref === "$a" || ref === "$b") && ruleEvent !== "collision") {
    errors.push(`${path}: ${ref} is only available for collision rules`);
  }
}

function validateSpriteAsset(entity, path, assetsById, errors) {
  if (entity?.kind !== "sprite") return;
  const asset = assetsById.get(entity.asset);
  if (!asset) {
    errors.push(`${path}.asset: references unknown asset '${entity?.asset}'`);
    return;
  }
  if (asset.kind !== "image") errors.push(`${path}.asset: '${entity.asset}' is not an image asset`);
}

function walkActions(actions, context, path, errors) {
  if (!Array.isArray(actions)) return;
  actions.forEach((action, index) => {
    const actionPath = `${path}[${index}]`;
    if (!isObject(action)) return;
    const keys = Object.keys(action);
    if (keys.length !== 1) return;
    const type = keys[0];
    const payload = action[type];
    const allowed = ACTION_PAYLOAD_KEYS[type];
    if (allowed && isObject(payload)) unknownKeys(payload, allowed, `${actionPath}.${type}`, errors);

    switch (type) {
      case "setVar":
      case "addVar":
        walkExpression(payload?.value, `${actionPath}.${type}.value`, errors);
        break;
      case "setEntity":
      case "moveEntity":
      case "setVelocity":
        validateEntityRef(payload?.entity, context.ruleEvent, context.knownEntityIds, `${actionPath}.${type}.entity`, errors);
        for (const key of ["x", "y", "vx", "vy", "rotation", "opacity"]) walkExpression(payload?.[key], `${actionPath}.${type}.${key}`, errors);
        break;
      case "spawn":
        if (typeof payload?.template === "string" && !context.templateIds.has(payload.template)) {
          errors.push(`${actionPath}.spawn.template: references unknown template '${payload.template}'`);
        }
        for (const key of ["x", "y", "vx", "vy"]) walkExpression(payload?.[key], `${actionPath}.spawn.${key}`, errors);
        break;
      case "destroy":
        validateEntityRef(payload?.entity, context.ruleEvent, context.knownEntityIds, `${actionPath}.destroy.entity`, errors);
        break;
      case "emit":
        validateEmitData(payload?.data, `${actionPath}.emit.data`, errors);
        break;
      case "sound": {
        const asset = context.assetsById.get(payload?.asset);
        if (!asset) errors.push(`${actionPath}.sound.asset: references unknown asset '${payload?.asset}'`);
        else if (asset.kind !== "audio") errors.push(`${actionPath}.sound.asset: '${payload.asset}' is not an audio asset`);
        break;
      }
      case "complete":
      case "fail":
        walkExpression(payload?.score, `${actionPath}.${type}.score`, errors);
        if (typeof payload?.detail === "string" && payload.detail.length > 160) errors.push(`${actionPath}.${type}.detail: exceeds 160 characters`);
        break;
      case "if":
        walkCondition(payload?.condition, `${actionPath}.if.condition`, errors);
        walkActions(payload?.then, context, `${actionPath}.if.then`, errors);
        walkActions(payload?.else || [], context, `${actionPath}.if.else`, errors);
        break;
      default:
        break;
    }
  });
}

export function validatePublicationPolicy(spec) {
  const errors = [];
  const warnings = [];
  if (!isObject(spec)) return { ok: false, errors: ["spec: must be an object"], warnings };

  unknownKeys(spec, TOP_LEVEL_KEYS, "spec", errors);
  unknownKeys(spec.canvas, CANVAS_KEYS, "canvas", errors);

  const assetsById = new Map();
  const usedAssetIds = new Set();
  for (const [index, asset] of (Array.isArray(spec.assets) ? spec.assets : []).entries()) {
    unknownKeys(asset, ASSET_KEYS, `assets[${index}]`, errors);
    if (typeof asset?.id === "string") {
      if (assetsById.has(asset.id)) errors.push(`assets[${index}].id: duplicate asset id '${asset.id}'`);
      assetsById.set(asset.id, asset);
    }
  }

  const templateIds = new Set(Object.keys(isObject(spec.templates) ? spec.templates : {}));
  for (const [id, template] of Object.entries(isObject(spec.templates) ? spec.templates : {})) {
    unknownKeys(template, TEMPLATE_KEYS, `templates.${id}`, errors);
    if (typeof template?.text === "string" && template.text.length > 256) errors.push(`templates.${id}.text: exceeds 256 characters`);
    if (typeof template?.color === "string" && template.color.length > 64) errors.push(`templates.${id}.color: exceeds 64 characters`);
    validateSpriteAsset(template, `templates.${id}`, assetsById, errors);
    if (template?.kind === "sprite" && typeof template.asset === "string") usedAssetIds.add(template.asset);
  }

  const startingEntityIds = new Set();
  for (const [index, entity] of (Array.isArray(spec.entities) ? spec.entities : []).entries()) {
    unknownKeys(entity, ENTITY_KEYS, `entities[${index}]`, errors);
    if (typeof entity?.id === "string") startingEntityIds.add(entity.id);
    if (typeof entity?.text === "string" && entity.text.length > 256) errors.push(`entities[${index}].text: exceeds 256 characters`);
    if (typeof entity?.color === "string" && entity.color.length > 64) errors.push(`entities[${index}].color: exceeds 64 characters`);
    validateSpriteAsset(entity, `entities[${index}]`, assetsById, errors);
    if (entity?.kind === "sprite" && typeof entity.asset === "string") usedAssetIds.add(entity.asset);
  }

  const timerIds = new Set();
  for (const [index, timer] of (Array.isArray(spec.timers) ? spec.timers : []).entries()) {
    unknownKeys(timer, TIMER_KEYS, `timers[${index}]`, errors);
    if (typeof timer?.id === "string") {
      if (timerIds.has(timer.id)) errors.push(`timers[${index}].id: duplicate timer id '${timer.id}'`);
      timerIds.add(timer.id);
    }
  }

  for (const [name, value] of Object.entries(isObject(spec.variables) ? spec.variables : {})) {
    if (typeof value === "string" && value.length > 128) errors.push(`variables.${name}: string exceeds 128 characters`);
  }

  const fixedSpawnIds = new Set();
  for (const rule of Array.isArray(spec.rules) ? spec.rules : []) collectFixedSpawnIds(rule?.actions, fixedSpawnIds);
  const knownEntityIds = new Set([...startingEntityIds, ...fixedSpawnIds]);

  for (const [index, rule] of (Array.isArray(spec.rules) ? spec.rules : []).entries()) {
    const path = `rules[${index}]`;
    unknownKeys(rule, RULE_KEYS, path, errors);
    if (rule?.timerId !== undefined && rule.on !== "timer") errors.push(`${path}.timerId: only valid on timer rules`);
    if (typeof rule?.timerId === "string" && !timerIds.has(rule.timerId)) errors.push(`${path}.timerId: references unknown timer '${rule.timerId}'`);
    if (rule?.targetTag !== undefined && !TARGET_EVENTS.has(rule.on)) errors.push(`${path}.targetTag: not valid for '${rule.on}' rules`);
    if ((rule?.aTag !== undefined || rule?.bTag !== undefined) && rule.on !== "collision") errors.push(`${path}: aTag/bTag are only valid on collision rules`);
    if (rule?.condition !== undefined) walkCondition(rule.condition, `${path}.condition`, errors);
    walkActions(rule?.actions, { ruleEvent: rule?.on, knownEntityIds, templateIds, assetsById }, `${path}.actions`, errors);
    for (const action of rule?.actions || []) {
      if (action?.sound?.asset) usedAssetIds.add(action.sound.asset);
    }
  }

  if ((spec.assets || []).length > 12) warnings.push("More than 12 assets may increase first-play fetch latency even when total bytes stay within the instant tier.");
  if (fixedSpawnIds.size > 8) warnings.push("Many fixed spawn ids can make remixes brittle; prefer generated ids unless later rules must reference them directly.");
  const unusedAssets = [...assetsById.keys()].filter((id) => !usedAssetIds.has(id));
  if (unusedAssets.length) warnings.push(`Unused assets add package weight: ${unusedAssets.join(", ")}`);

  return { ok: errors.length === 0, errors, warnings };
}
