import { HARD_LIMITS } from "./game-spec.js";
import { RUNTIME_V2_ID, validateGameSpecV2, validatePublicationPolicyV2 } from "./game-spec-v2.js";

export const RUNTIME_V3_ID = "playloop-2d-v3";
export const V3_GRID_OPS = Object.freeze(["isCellFree", "canMoveBy", "pathClearToEdge", "column", "row"]);
export const V3_GRID_ACTIONS = Object.freeze(["moveGridEntity", "moveGridBy"]);
export const V3_LIMITS = Object.freeze({
  maxGrids: 4,
  maxColumns: 10,
  maxRows: 10,
  maxCellsPerGrid: 64,
  maxSpan: 4,
});

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EVENT_REFS = new Set(["$target", "$a", "$b"]);
const TARGET_EVENTS = new Set(["tap", "pointerDown", "pointerMove", "pointerUp", "entityExit"]);
const GRID_OP_SET = new Set(V3_GRID_OPS);
const GRID_ACTION_SET = new Set(V3_GRID_ACTIONS);
const DIRECTIONS = new Set(["left", "right", "up", "down"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGridRead(value) {
  return isObject(value)
    && Object.keys(value).length === 1
    && Object.hasOwn(value, "grid");
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
  if (isGridRead(value)) {
    const read = value.grid;
    if (!isObject(read)) return 0;
    const children = ["column", "row", "dx", "dy", "direction"]
      .filter((key) => read[key] !== undefined)
      .map((key) => sanitizeExpression(read[key]));
    if (!children.length) return 0;
    if (children.length === 1) return children[0];
    return { add: [0, ...children] };
  }
  const output = {};
  for (const [key, child] of Object.entries(value)) output[key] = sanitizeExpression(child);
  return output;
}

function sanitizeActions(actions) {
  return (actions || []).map((action) => {
    if (!isObject(action)) return action;
    const keys = Object.keys(action);
    if (keys.length === 1 && GRID_ACTION_SET.has(keys[0])) {
      const payload = action[keys[0]] || {};
      if (keys[0] === "moveGridBy") {
        return {
          moveEntity: {
            entity: payload.entity,
            x: sanitizeExpression(payload.dx ?? 0),
            y: sanitizeExpression(payload.dy ?? 0),
          },
        };
      }
      return {
        setEntity: {
          entity: payload.entity,
          x: sanitizeExpression(payload.column ?? 0),
          y: sanitizeExpression(payload.row ?? 0),
        },
      };
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

export function downgradeV3ForV2Validation(spec) {
  const copy = clone(spec) || {};
  copy.runtime = RUNTIME_V2_ID;
  delete copy.grids;
  for (const entity of copy.entities || []) delete entity.grid;
  for (const template of Object.values(copy.templates || {})) delete template.grid;
  for (const rule of copy.rules || []) {
    if (rule.condition !== undefined) rule.condition = sanitizeExpression(rule.condition);
    rule.actions = sanitizeActions(rule.actions || []);
  }
  return copy;
}

function validateGrids(grids, errors) {
  if (!isObject(grids)) {
    errors.push("grids: must be an object");
    return new Map();
  }
  const entries = Object.entries(grids);
  if (entries.length > V3_LIMITS.maxGrids) errors.push(`grids: max ${V3_LIMITS.maxGrids} grids`);
  const map = new Map();
  for (const [id, grid] of entries) {
    const path = `grids.${id}`;
    if (!SAFE_ID.test(id)) {
      errors.push(`${path}: invalid grid id`);
      continue;
    }
    if (!isObject(grid)) {
      errors.push(`${path}: must be an object`);
      continue;
    }
    const allowed = new Set(["columns", "rows", "originX", "originY", "cellWidth", "cellHeight"]);
    for (const key of Object.keys(grid)) if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
    const columns = Number(grid.columns);
    const rows = Number(grid.rows);
    if (!Number.isInteger(columns) || columns < 1 || columns > V3_LIMITS.maxColumns) {
      errors.push(`${path}.columns: must be integer 1-${V3_LIMITS.maxColumns}`);
    }
    if (!Number.isInteger(rows) || rows < 1 || rows > V3_LIMITS.maxRows) {
      errors.push(`${path}.rows: must be integer 1-${V3_LIMITS.maxRows}`);
    }
    if (Number.isInteger(columns) && Number.isInteger(rows) && columns * rows > V3_LIMITS.maxCellsPerGrid) {
      errors.push(`${path}: max ${V3_LIMITS.maxCellsPerGrid} cells`);
    }
    for (const key of ["originX", "originY"]) {
      if (typeof grid[key] !== "number" || !Number.isFinite(grid[key])) errors.push(`${path}.${key}: must be finite number`);
    }
    for (const key of ["cellWidth", "cellHeight"]) {
      if (typeof grid[key] !== "number" || !Number.isFinite(grid[key]) || grid[key] <= 0) {
        errors.push(`${path}.${key}: must be positive finite number`);
      }
    }
    map.set(id, grid);
  }
  return map;
}

function placementCells(placement) {
  const cells = [];
  const columns = placement.columnSpan ?? 1;
  const rows = placement.rowSpan ?? 1;
  for (let row = placement.row; row < placement.row + rows; row += 1) {
    for (let column = placement.column; column < placement.column + columns; column += 1) {
      cells.push(`${column},${row}`);
    }
  }
  return cells;
}

function validatePlacements(spec, gridsById, errors) {
  const occupied = new Map();
  for (const [index, entity] of (spec.entities || []).entries()) {
    if (entity?.grid === undefined) continue;
    const placement = entity.grid;
    const path = `entities[${index}].grid`;
    if (!isObject(placement)) {
      errors.push(`${path}: must be an object`);
      continue;
    }
    const allowed = new Set(["grid", "column", "row", "columnSpan", "rowSpan"]);
    for (const key of Object.keys(placement)) if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
    const grid = gridsById.get(placement.grid);
    if (!grid) {
      errors.push(`${path}.grid: unknown grid '${placement.grid}'`);
      continue;
    }
    for (const key of ["column", "row"]) {
      if (!Number.isInteger(placement[key]) || placement[key] < 0) errors.push(`${path}.${key}: must be a non-negative integer`);
    }
    for (const key of ["columnSpan", "rowSpan"]) {
      if (placement[key] !== undefined && (!Number.isInteger(placement[key]) || placement[key] < 1 || placement[key] > V3_LIMITS.maxSpan)) {
        errors.push(`${path}.${key}: must be integer 1-${V3_LIMITS.maxSpan}`);
      }
    }
    const columnSpan = placement.columnSpan ?? 1;
    const rowSpan = placement.rowSpan ?? 1;
    if (Number.isInteger(placement.column) && Number.isInteger(placement.row)) {
      if (placement.column + columnSpan > grid.columns || placement.row + rowSpan > grid.rows) {
        errors.push(`${path}: placement exceeds grid '${placement.grid}' bounds`);
        continue;
      }
      const gridOccupied = occupied.get(placement.grid) || new Map();
      for (const cell of placementCells({ ...placement, columnSpan, rowSpan })) {
        const existing = gridOccupied.get(cell);
        if (existing) errors.push(`${path}: overlaps '${existing}' at cell ${cell}`);
        else gridOccupied.set(cell, entity.id || `entity-${index}`);
      }
      occupied.set(placement.grid, gridOccupied);
    }
  }

  for (const [id, template] of Object.entries(spec.templates || {})) {
    if (template?.grid !== undefined) errors.push(`templates.${id}.grid: grid placement is not supported on v3 templates yet`);
  }
}

function validateGridRead(expression, eventName, initialIds, gridsById, path, errors) {
  const read = expression.grid;
  if (!isObject(read)) {
    errors.push(`${path}.grid: must be an object`);
    return;
  }
  if (!GRID_OP_SET.has(read.op)) {
    errors.push(`${path}.grid.op: unsupported grid operation '${read.op}'`);
    return;
  }
  const allowedByOp = {
    isCellFree: new Set(["op", "grid", "column", "row", "ignoreEntity"]),
    canMoveBy: new Set(["op", "entity", "dx", "dy"]),
    pathClearToEdge: new Set(["op", "entity", "direction"]),
    column: new Set(["op", "entity"]),
    row: new Set(["op", "entity"]),
  };
  const allowed = allowedByOp[read.op];
  for (const key of Object.keys(read)) if (!allowed.has(key)) errors.push(`${path}.grid.${key}: unknown field`);

  if (read.grid !== undefined && !gridsById.has(read.grid)) errors.push(`${path}.grid.grid: unknown grid '${read.grid}'`);
  if (read.entity !== undefined && !validRefForEvent(read.entity, eventName, initialIds)) {
    errors.push(`${path}.grid.entity: '${read.entity}' is not available for '${eventName}'`);
  }
  if (read.ignoreEntity !== undefined && !validRefForEvent(read.ignoreEntity, eventName, initialIds)) {
    errors.push(`${path}.grid.ignoreEntity: '${read.ignoreEntity}' is not available for '${eventName}'`);
  }
  if (read.op === "isCellFree") {
    if (read.grid === undefined) errors.push(`${path}.grid.grid: is required`);
    if (read.column === undefined) errors.push(`${path}.grid.column: is required`);
    if (read.row === undefined) errors.push(`${path}.grid.row: is required`);
  }
  if (["canMoveBy", "pathClearToEdge", "column", "row"].includes(read.op) && read.entity === undefined) {
    errors.push(`${path}.grid.entity: is required`);
  }
  if (read.op === "canMoveBy") {
    if (read.dx === undefined) errors.push(`${path}.grid.dx: is required`);
    if (read.dy === undefined) errors.push(`${path}.grid.dy: is required`);
  }
  if (read.op === "pathClearToEdge" && read.direction === undefined) errors.push(`${path}.grid.direction: is required`);
}

function walkExpressions(value, eventName, initialIds, gridsById, path, errors, depth = 0) {
  if (depth > HARD_LIMITS.maxExpressionDepth) {
    errors.push(`${path}: expression is too deeply nested`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkExpressions(item, eventName, initialIds, gridsById, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (!isObject(value)) return;
  if (isGridRead(value)) {
    validateGridRead(value, eventName, initialIds, gridsById, path, errors);
    for (const key of ["column", "row", "dx", "dy", "direction"]) {
      if (value.grid?.[key] !== undefined) {
        walkExpressions(value.grid[key], eventName, initialIds, gridsById, `${path}.grid.${key}`, errors, depth + 1);
      }
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkExpressions(child, eventName, initialIds, gridsById, `${path}.${key}`, errors, depth + 1);
  }
}

function validateGridAction(action, type, eventName, initialIds, gridsById, path, errors) {
  const payload = action[type];
  if (!isObject(payload)) {
    errors.push(`${path}.${type}: must be an object`);
    return;
  }
  const allowed = type === "moveGridEntity"
    ? new Set(["entity", "column", "row"])
    : new Set(["entity", "dx", "dy"]);
  for (const key of Object.keys(payload)) if (!allowed.has(key)) errors.push(`${path}.${type}.${key}: unknown field`);
  if (!validRefForEvent(payload.entity, eventName, initialIds)) {
    errors.push(`${path}.${type}.entity: '${payload.entity}' is not available for '${eventName}'`);
  }
  for (const key of type === "moveGridEntity" ? ["column", "row"] : ["dx", "dy"]) {
    if (payload[key] === undefined) errors.push(`${path}.${type}.${key}: is required`);
    else walkExpressions(payload[key], eventName, initialIds, gridsById, `${path}.${type}.${key}`, errors);
  }
}

function walkActions(actions, eventName, initialIds, gridsById, path, errors) {
  if (!Array.isArray(actions)) return;
  actions.forEach((action, index) => {
    const actionPath = `${path}[${index}]`;
    if (!isObject(action)) return;
    const keys = Object.keys(action);
    if (keys.length === 1 && GRID_ACTION_SET.has(keys[0])) {
      validateGridAction(action, keys[0], eventName, initialIds, gridsById, actionPath, errors);
      return;
    }
    if (keys.some((key) => GRID_ACTION_SET.has(key))) {
      errors.push(`${actionPath}: v3 grid action must be the only action key`);
      return;
    }
    if (Object.hasOwn(action, "if") && isObject(action.if)) {
      walkExpressions(action.if.condition, eventName, initialIds, gridsById, `${actionPath}.if.condition`, errors);
      walkActions(action.if.then || [], eventName, initialIds, gridsById, `${actionPath}.if.then`, errors);
      walkActions(action.if.else || [], eventName, initialIds, gridsById, `${actionPath}.if.else`, errors);
      return;
    }
    walkExpressions(action, eventName, initialIds, gridsById, actionPath, errors);
  });
}

export function validateGameSpecV3(spec) {
  const errors = [];
  if (!isObject(spec)) return { ok: false, errors: ["spec: must be an object"] };
  if (spec.runtime !== RUNTIME_V3_ID) errors.push(`runtime: must be ${RUNTIME_V3_ID}`);
  const originalBytes = byteLength(spec);
  if (originalBytes > HARD_LIMITS.maxSpecBytes) errors.push(`spec: JSON is ${originalBytes} bytes; max ${HARD_LIMITS.maxSpecBytes}`);

  const downgraded = downgradeV3ForV2Validation(spec);
  const base = validateGameSpecV2(downgraded);
  errors.push(...base.errors.filter((message) => !message.startsWith("spec: JSON is ")));

  const gridsById = validateGrids(spec.grids, errors);
  validatePlacements(spec, gridsById, errors);
  const initialIds = new Set((spec.entities || []).map((entity) => entity?.id).filter(Boolean));
  (spec.rules || []).forEach((rule, index) => {
    const eventName = rule?.on;
    if (rule?.condition !== undefined) {
      walkExpressions(rule.condition, eventName, initialIds, gridsById, `rules[${index}].condition`, errors);
    }
    walkActions(rule?.actions || [], eventName, initialIds, gridsById, `rules[${index}].actions`, errors);
  });

  return { ok: errors.length === 0, errors };
}

export function validatePublicationPolicyV3(spec) {
  const validation = validateGameSpecV3(spec);
  if (!validation.ok) return { ok: false, errors: [...validation.errors], warnings: [] };
  const base = validatePublicationPolicyV2(downgradeV3ForV2Validation(spec));
  return {
    ok: base.ok,
    errors: [...base.errors],
    warnings: [...base.warnings],
    metrics: {
      ...(base.metrics || {}),
      runtime: RUNTIME_V3_ID,
      specBytes: byteLength(spec),
      grids: Object.keys(spec.grids || {}).length,
      gridCells: Object.values(spec.grids || {}).reduce((sum, grid) => sum + Number(grid?.columns || 0) * Number(grid?.rows || 0), 0),
      gridEntities: (spec.entities || []).filter((entity) => entity?.grid).length,
    },
  };
}

export function packageProfileV3(spec) {
  const validation = validateGameSpecV3(spec);
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
      collections: Object.keys(spec?.collections || {}).length,
      grids: Object.keys(spec?.grids || {}).length,
      gridCells: Object.values(spec?.grids || {}).reduce((sum, grid) => sum + Number(grid?.columns || 0) * Number(grid?.rows || 0), 0),
      gridEntities: (spec?.entities || []).filter((entity) => entity?.grid).length,
    },
  };
}

export { DIRECTIONS as V3_GRID_DIRECTIONS };
