import { SafeSandboxRuntimeV1 } from "./runtime-v1.js";
import { isV1ScalarStateValue } from "./game-spec-v1.js";
import {
  V2_COLLECTION_ACTIONS,
  V2_LIMITS,
  downgradeV2ForV1Validation,
  validateGameSpecV2,
} from "./game-spec-v2.js";

const COLLECTION_ACTION_SET = new Set(V2_COLLECTION_ACTIONS);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCollectionRead(expr) {
  return isObject(expr)
    && Object.keys(expr).length === 1
    && isObject(expr.collection)
    && typeof expr.collection.name === "string";
}

export class SafeSandboxRuntimeV2 extends SafeSandboxRuntimeV1 {
  constructor(spec, options = {}) {
    const validation = validateGameSpecV2(spec);
    if (!validation.ok) throw new Error(`Invalid GameSpec v2:\n${validation.errors.join("\n")}`);

    super(downgradeV2ForV1Validation(spec), options);
    this.spec = clone(spec);
    this.variables = clone(spec.variables || {});
    this.collections = clone(spec.collections || {});
  }

  failCollection(reason, detail) {
    this.status = "failed";
    this.result = {
      score: Number(this.variables.score || 0),
      detail,
      elapsedMs: Math.round(this.elapsedMs),
      reason,
    };
    throw new Error(detail);
  }

  getCollection(name) {
    const collection = this.collections?.[name];
    if (!Array.isArray(collection)) {
      this.failCollection("missing_collection", `Unknown collection ${name}`);
    }
    return collection;
  }

  evaluateCollectionIndex(expr, event, name) {
    const value = Number(this.evaluateExpression(expr, event));
    if (!Number.isInteger(value)) {
      this.failCollection("invalid_collection_index", `Collection ${name} index must be an integer`);
    }
    return value;
  }

  evaluateExpression(expr, event) {
    if (isCollectionRead(expr)) {
      this.bumpOps();
      const read = expr.collection;
      const collection = this.getCollection(read.name);
      if (read.op === "length") return collection.length;
      if (read.op === "first") return collection.length ? clone(collection[0]) : null;
      if (read.op === "last") return collection.length ? clone(collection[collection.length - 1]) : null;
      if (read.op === "at") {
        const index = Number(this.evaluateExpression(read.index, event));
        if (!Number.isInteger(index) || index < 0 || index >= collection.length) return null;
        return clone(collection[index]);
      }
      return null;
    }
    return super.evaluateExpression(expr, event);
  }

  ensureScalar(value, name) {
    if (!isV1ScalarStateValue(value)) {
      this.failCollection("invalid_collection_value", `Collection ${name} only accepts scalar values`);
    }
    if (typeof value === "string" && value.length > V2_LIMITS.maxCollectionStringLength) {
      this.failCollection(
        "collection_string_too_long",
        `Collection ${name} string exceeds ${V2_LIMITS.maxCollectionStringLength} characters`,
      );
    }
  }

  executeCollectionAction(type, payload, event) {
    const collection = this.getCollection(payload.name);

    switch (type) {
      case "pushCollection": {
        if (collection.length >= V2_LIMITS.maxItemsPerCollection) {
          this.failCollection(
            "collection_budget_exceeded",
            `Collection ${payload.name} exceeded ${V2_LIMITS.maxItemsPerCollection} items`,
          );
        }
        const next = this.evaluateExpression(payload.value, event);
        this.ensureScalar(next, payload.name);
        collection.push(clone(next));
        break;
      }
      case "setCollectionItem": {
        const index = this.evaluateCollectionIndex(payload.index, event, payload.name);
        if (index < 0 || index >= collection.length) {
          this.failCollection(
            "collection_index_out_of_bounds",
            `Collection ${payload.name} index ${index} is out of bounds`,
          );
        }
        const next = this.evaluateExpression(payload.value, event);
        this.ensureScalar(next, payload.name);
        collection[index] = clone(next);
        break;
      }
      case "removeCollectionAt": {
        const index = this.evaluateCollectionIndex(payload.index, event, payload.name);
        if (index < 0 || index >= collection.length) {
          this.failCollection(
            "collection_index_out_of_bounds",
            `Collection ${payload.name} index ${index} is out of bounds`,
          );
        }
        collection.splice(index, 1);
        break;
      }
      case "clearCollection":
        collection.splice(0, collection.length);
        break;
      case "shuffleCollection":
        for (let index = collection.length - 1; index > 0; index -= 1) {
          this.bumpOps();
          const other = Math.floor(this.random() * (index + 1));
          [collection[index], collection[other]] = [collection[other], collection[index]];
        }
        break;
      default:
        break;
    }
  }

  executeActions(actions, event) {
    for (const action of actions || []) {
      if (this.status !== "running") return;
      const type = Object.keys(action || {})[0];
      if (!COLLECTION_ACTION_SET.has(type)) {
        super.executeActions([action], event);
        continue;
      }
      this.bumpOps();
      this.executeCollectionAction(type, action[type], event);
    }
  }

  snapshot() {
    return {
      ...super.snapshot(),
      collections: clone(this.collections),
    };
  }
}
