import { SafeSandboxRuntime } from "./safe-runtime.js";
import {
  V1_LIMITS,
  downgradeV1ForV0Validation,
  isV1ScalarStateValue,
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

  failState(reason, detail) {
    this.status = "failed";
    this.result = {
      score: Number(this.variables.score || 0),
      detail,
      elapsedMs: Math.round(this.elapsedMs),
      reason,
    };
    throw new Error(detail);
  }

  ensureStateKeyBudget(entity, key) {
    if (Object.hasOwn(entity.state, key)) return;
    if (Object.keys(entity.state).length >= V1_LIMITS.maxStateKeysPerEntity) {
      this.failState(
        "entity_state_budget_exceeded",
        `Entity ${entity.id} exceeded ${V1_LIMITS.maxStateKeysPerEntity} state keys`,
      );
    }
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
      this.ensureStateKeyBudget(entity, value.key);

      const next = this.evaluateExpression(value.value, event);
      if (type === "setEntityState") {
        if (!isV1ScalarStateValue(next)) {
          this.failState("invalid_entity_state_value", `Invalid scalar state value for ${id}.${value.key}`);
        }
        if (typeof next === "string" && next.length > V1_LIMITS.maxStateStringLength) {
          this.failState(
            "entity_state_string_too_long",
            `Entity state string exceeds ${V1_LIMITS.maxStateStringLength} characters for ${id}.${value.key}`,
          );
        }
        entity.state[value.key] = clone(next);
        continue;
      }

      const current = Object.hasOwn(entity.state, value.key) ? entity.state[value.key] : 0;
      if (typeof current !== "number" || !Number.isFinite(current) || typeof next !== "number" || !Number.isFinite(next)) {
        this.failState("invalid_entity_state_math", `Non-numeric addEntityState for ${id}.${value.key}`);
      }
      entity.state[value.key] = current + next;
    }
  }
}
