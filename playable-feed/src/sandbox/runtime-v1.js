import { SafeSandboxRuntime } from "./safe-runtime.js";
import {
  downgradeV1ForV0Validation,
  validateGameSpecV1,
} from "./game-spec-v1.js";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEntityRead(expr) {
  return isObject(expr)
    && Object.keys(expr).length === 1
    && isObject(expr.entity)
    && typeof expr.entity.ref === "string";
}

export class SafeSandboxRuntimeV1 extends SafeSandboxRuntime {
  constructor(spec, options = {}) {
    const validation = validateGameSpecV1(spec);
    if (!validation.ok) throw new Error(`Invalid GameSpec v1:\n${validation.errors.join("\n")}`);

    // The v0 runtime remains the battle-tested execution base. Constructor-time
    // validation receives a semantics-preserving validation downgrade; once
    // initialized, execution uses the original v1 rules and templates.
    super(downgradeV1ForV0Validation(spec), options);
    this.spec = clone(spec);
    this.variables = clone(spec.variables || {});

    for (const source of spec.entities || []) {
      const entity = this.entities.get(source.id);
      if (entity) entity.state = clone(source.state || {});
    }
  }

  normalizeEntity(entity) {
    const normalized = super.normalizeEntity(entity);
    normalized.state = clone(entity?.state || {});
    return normalized;
  }

  evaluateExpression(expr, event) {
    if (isEntityRead(expr)) {
      this.bumpOps();
      const read = expr.entity;
      const id = this.resolveEntityRef(read.ref, event);
      const entity = this.entities.get(id);
      if (!entity) return null;
      if (read.field !== undefined) return entity[read.field] ?? null;
      if (read.state !== undefined) return entity.state?.[read.state] ?? null;
      return null;
    }
    return super.evaluateExpression(expr, event);
  }

  executeActions(actions, event) {
    for (const action of actions || []) {
      if (this.status !== "running") return;
      const type = Object.keys(action || {})[0];
      if (type !== "setEntityState" && type !== "addEntityState") {
        // Calling the base implementation one action at a time preserves its
        // existing operation counting. Nested `if` actions dispatch back into
        // this override, so v1 state actions work inside conditions too.
        super.executeActions([action], event);
        continue;
      }

      this.bumpOps();
      const value = action[type];
      const id = this.resolveEntityRef(value.entity, event);
      const entity = this.entities.get(id);
      if (!entity) continue;
      if (!isObject(entity.state)) entity.state = {};

      const next = this.evaluateExpression(value.value, event);
      if (type === "setEntityState") {
        entity.state[value.key] = clone(next);
        continue;
      }

      const currentNumber = Number(entity.state[value.key] ?? 0);
      const delta = Number(next ?? 0);
      if (!Number.isFinite(currentNumber) || !Number.isFinite(delta)) {
        this.status = "failed";
        this.result = {
          score: Number(this.variables.score || 0),
          detail: `Non-numeric addEntityState for ${id}.${value.key}`,
          elapsedMs: Math.round(this.elapsedMs),
          reason: "invalid_entity_state_math",
        };
        throw new Error(this.result.detail);
      }
      entity.state[value.key] = currentNumber + delta;
    }
  }
}
