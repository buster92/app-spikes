import { SafeSandboxRuntimeV2 } from "./runtime-v2.js";
import {
  V3_GRID_ACTIONS,
  downgradeV3ForV2Validation,
  validateGameSpecV3,
} from "./game-spec-v3.js";

const GRID_ACTION_SET = new Set(V3_GRID_ACTIONS);
const DIRECTIONS = new Set(["left", "right", "up", "down"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGridRead(expr) {
  return isObject(expr)
    && Object.keys(expr).length === 1
    && isObject(expr.grid)
    && typeof expr.grid.op === "string";
}

export class SafeSandboxRuntimeV3 extends SafeSandboxRuntimeV2 {
  constructor(spec, options = {}) {
    const validation = validateGameSpecV3(spec);
    if (!validation.ok) throw new Error(`Invalid GameSpec v3:\n${validation.errors.join("\n")}`);

    super(downgradeV3ForV2Validation(spec), options);
    this.spec = clone(spec);
    this.variables = clone(spec.variables || {});
    this.collections = clone(spec.collections || {});
    this.grids = clone(spec.grids || {});

    for (const source of spec.entities || []) {
      if (!source.grid) continue;
      const entity = this.entities.get(source.id);
      if (!entity) continue;
      entity.grid = clone({
        grid: source.grid.grid,
        column: source.grid.column,
        row: source.grid.row,
        columnSpan: source.grid.columnSpan ?? 1,
        rowSpan: source.grid.rowSpan ?? 1,
      });
      this.syncGridPosition(entity);
    }
  }

  failGrid(reason, detail) {
    this.status = "failed";
    this.result = {
      score: Number(this.variables.score || 0),
      detail,
      elapsedMs: Math.round(this.elapsedMs),
      reason,
    };
    throw new Error(detail);
  }

  gridConfig(id) {
    const grid = this.grids?.[id];
    if (!grid) this.failGrid("missing_grid", `Unknown grid ${id}`);
    return grid;
  }

  gridEntity(ref, event) {
    const id = this.resolveEntityRef(ref, event);
    const entity = this.entities.get(id);
    if (!entity?.grid) return null;
    return entity;
  }

  syncGridPosition(entity) {
    const placement = entity?.grid;
    if (!placement) return;
    const grid = this.gridConfig(placement.grid);
    entity.x = Number(grid.originX) + (placement.column + placement.columnSpan / 2) * Number(grid.cellWidth);
    entity.y = Number(grid.originY) + (placement.row + placement.rowSpan / 2) * Number(grid.cellHeight);
  }

  occupiedCells(entity, placement = entity?.grid) {
    if (!placement) return [];
    const cells = [];
    for (let row = placement.row; row < placement.row + placement.rowSpan; row += 1) {
      for (let column = placement.column; column < placement.column + placement.columnSpan; column += 1) {
        cells.push({ column, row });
      }
    }
    return cells;
  }

  placementInsideGrid(placement) {
    const grid = this.gridConfig(placement.grid);
    return Number.isInteger(placement.column)
      && Number.isInteger(placement.row)
      && placement.column >= 0
      && placement.row >= 0
      && placement.column + placement.columnSpan <= grid.columns
      && placement.row + placement.rowSpan <= grid.rows;
  }

  cellOccupied(gridId, column, row, ignoreEntityId = null) {
    for (const entity of this.entities.values()) {
      if (entity.id === ignoreEntityId || entity.grid?.grid !== gridId) continue;
      for (const cell of this.occupiedCells(entity)) {
        if (cell.column === column && cell.row === row) return entity.id;
      }
    }
    return null;
  }

  placementIsFree(placement, ignoreEntityId = null) {
    if (!this.placementInsideGrid(placement)) return false;
    return this.occupiedCells(null, placement).every(
      ({ column, row }) => !this.cellOccupied(placement.grid, column, row, ignoreEntityId),
    );
  }

  integerExpression(expr, event, label) {
    const value = Number(this.evaluateExpression(expr, event));
    if (!Number.isInteger(value)) this.failGrid("invalid_grid_coordinate", `${label} must resolve to an integer`);
    return value;
  }

  pathClearToEdge(entity, direction) {
    if (!entity?.grid || !DIRECTIONS.has(direction)) return false;
    const placement = entity.grid;
    const grid = this.gridConfig(placement.grid);

    if (direction === "left") {
      for (let row = placement.row; row < placement.row + placement.rowSpan; row += 1) {
        for (let column = placement.column - 1; column >= 0; column -= 1) {
          if (this.cellOccupied(placement.grid, column, row, entity.id)) return false;
        }
      }
      return true;
    }
    if (direction === "right") {
      for (let row = placement.row; row < placement.row + placement.rowSpan; row += 1) {
        for (let column = placement.column + placement.columnSpan; column < grid.columns; column += 1) {
          if (this.cellOccupied(placement.grid, column, row, entity.id)) return false;
        }
      }
      return true;
    }
    if (direction === "up") {
      for (let column = placement.column; column < placement.column + placement.columnSpan; column += 1) {
        for (let row = placement.row - 1; row >= 0; row -= 1) {
          if (this.cellOccupied(placement.grid, column, row, entity.id)) return false;
        }
      }
      return true;
    }
    for (let column = placement.column; column < placement.column + placement.columnSpan; column += 1) {
      for (let row = placement.row + placement.rowSpan; row < grid.rows; row += 1) {
        if (this.cellOccupied(placement.grid, column, row, entity.id)) return false;
      }
    }
    return true;
  }

  evaluateExpression(expr, event) {
    if (isGridRead(expr)) {
      this.bumpOps();
      const read = expr.grid;
      if (read.op === "isCellFree") {
        const column = this.integerExpression(read.column, event, "grid column");
        const row = this.integerExpression(read.row, event, "grid row");
        const ignore = read.ignoreEntity === undefined ? null : this.resolveEntityRef(read.ignoreEntity, event);
        const grid = this.gridConfig(read.grid);
        if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return false;
        return this.cellOccupied(read.grid, column, row, ignore) === null;
      }

      const entity = this.gridEntity(read.entity, event);
      if (!entity) return null;
      if (read.op === "column") return entity.grid.column;
      if (read.op === "row") return entity.grid.row;
      if (read.op === "canMoveBy") {
        const dx = this.integerExpression(read.dx, event, "grid dx");
        const dy = this.integerExpression(read.dy, event, "grid dy");
        return this.placementIsFree({
          ...entity.grid,
          column: entity.grid.column + dx,
          row: entity.grid.row + dy,
        }, entity.id);
      }
      if (read.op === "pathClearToEdge") {
        const direction = String(this.evaluateExpression(read.direction, event));
        return this.pathClearToEdge(entity, direction);
      }
      return null;
    }
    return super.evaluateExpression(expr, event);
  }

  moveGridEntity(entity, column, row) {
    if (!entity?.grid) this.failGrid("entity_not_on_grid", `Entity ${entity?.id || "<missing>"} is not on a grid`);
    const next = { ...entity.grid, column, row };
    if (!this.placementIsFree(next, entity.id)) {
      this.failGrid("grid_move_blocked", `Grid move for ${entity.id} is blocked or outside the board`);
    }
    entity.grid = next;
    this.syncGridPosition(entity);
  }

  executeActions(actions, event) {
    for (const action of actions || []) {
      if (this.status !== "running") return;
      const type = Object.keys(action || {})[0];
      if (!GRID_ACTION_SET.has(type)) {
        super.executeActions([action], event);
        continue;
      }

      this.bumpOps();
      const payload = action[type];
      const id = this.resolveEntityRef(payload.entity, event);
      const entity = this.entities.get(id);
      if (!entity) continue;

      if (type === "moveGridEntity") {
        const column = this.integerExpression(payload.column, event, "grid column");
        const row = this.integerExpression(payload.row, event, "grid row");
        this.moveGridEntity(entity, column, row);
      } else {
        const dx = this.integerExpression(payload.dx, event, "grid dx");
        const dy = this.integerExpression(payload.dy, event, "grid dy");
        this.moveGridEntity(entity, entity.grid.column + dx, entity.grid.row + dy);
      }
    }
  }
}
