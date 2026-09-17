import { HARD_LIMITS, validateGameSpec } from "./game-spec.js";

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasTag(entity, tag) {
  return Boolean(tag) && entity?.tags?.includes(tag);
}

function collides(a, b) {
  if (!a || !b) return false;
  if (a.kind === "circle" && b.kind === "circle") {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy <= (a.radius + b.radius) ** 2;
  }
  const box = (entity) => {
    if (entity.kind === "circle") {
      return { left: entity.x - entity.radius, right: entity.x + entity.radius, top: entity.y - entity.radius, bottom: entity.y + entity.radius };
    }
    return {
      left: entity.x - (entity.width || 0) / 2,
      right: entity.x + (entity.width || 0) / 2,
      top: entity.y - (entity.height || 0) / 2,
      bottom: entity.y + (entity.height || 0) / 2,
    };
  };
  const aa = box(a);
  const bb = box(b);
  return aa.left <= bb.right && aa.right >= bb.left && aa.top <= bb.bottom && aa.bottom >= bb.top;
}

export class SandboxRuntime {
  constructor(spec, { seed = 1, onEffect = () => {}, onEvent = () => {} } = {}) {
    const validation = validateGameSpec(spec);
    if (!validation.ok) throw new Error(`Invalid GameSpec:\n${validation.errors.join("\n")}`);

    this.spec = clone(spec);
    this.random = mulberry32(seed >>> 0);
    this.onEffect = onEffect;
    this.onEvent = onEvent;
    this.variables = clone(spec.variables || {});
    this.entities = new Map();
    this.nextEntityId = 1;
    this.elapsedMs = 0;
    this.status = "idle";
    this.result = null;
    this.operationCount = 0;
    this.timerState = new Map();
    this.lastCollisions = new Set();

    for (const entity of spec.entities || []) this.entities.set(entity.id, this.normalizeEntity(entity));
    for (const timer of spec.timers || []) {
      this.timerState.set(timer.id, {
        nextAt: timer.afterMs,
        everyMs: timer.everyMs || null,
        fired: false,
      });
    }
  }

  normalizeEntity(entity) {
    return {
      id: entity.id,
      kind: entity.kind,
      tags: [...(entity.tags || [])],
      x: Number(entity.x ?? 0),
      y: Number(entity.y ?? 0),
      vx: Number(entity.vx ?? 0),
      vy: Number(entity.vy ?? 0),
      width: Number(entity.width ?? 40),
      height: Number(entity.height ?? 40),
      radius: Number(entity.radius ?? 20),
      rotation: Number(entity.rotation ?? 0),
      opacity: entity.opacity === undefined ? 1 : Number(entity.opacity),
      color: entity.color || "#ffffff",
      text: entity.text || "",
      bounds: entity.bounds || "none",
    };
  }

  start() {
    if (this.status !== "idle") return;
    this.status = "running";
    this.dispatch("start", {});
  }

  step(deltaMs) {
    if (this.status !== "running") return;
    this.operationCount = 0;
    const dt = Math.min(HARD_LIMITS.maxStepMs, Math.max(0, Number(deltaMs) || 0));
    this.elapsedMs += dt;

    this.runTimers();
    this.integrate(dt / 1000);
    this.resolveBounds();
    this.detectCollisions();
    this.dispatch("tick", { deltaMs: dt });
  }

  pointer(type, x, y, extra = {}) {
    if (this.status !== "running") return;
    if (!new Set(["tap", "pointerDown", "pointerMove", "pointerUp"]).has(type)) return;
    const target = this.entityAt(x, y);
    this.dispatch(type, { x, y, target: target?.id || null, ...extra });
  }

  entityAt(x, y) {
    const entities = [...this.entities.values()].reverse();
    return entities.find((entity) => {
      if (entity.kind === "circle") return (x - entity.x) ** 2 + (y - entity.y) ** 2 <= entity.radius ** 2;
      const halfW = (entity.width || 0) / 2;
      const halfH = (entity.height || 0) / 2;
      return x >= entity.x - halfW && x <= entity.x + halfW && y >= entity.y - halfH && y <= entity.y + halfH;
    }) || null;
  }

  runTimers() {
    for (const timer of this.spec.timers || []) {
      const state = this.timerState.get(timer.id);
      if (!state || state.fired && !state.everyMs) continue;
      while (this.elapsedMs >= state.nextAt && this.status === "running") {
        this.dispatch("timer", { timerId: timer.id });
        if (state.everyMs) state.nextAt += state.everyMs;
        else {
          state.fired = true;
          break;
        }
        if (state.nextAt > HARD_LIMITS.maxDurationMs) break;
      }
    }
  }

  integrate(seconds) {
    for (const entity of this.entities.values()) {
      entity.x += entity.vx * seconds;
      entity.y += entity.vy * seconds;
    }
  }

  resolveBounds() {
    const width = this.spec.canvas.width;
    const height = this.spec.canvas.height;
    for (const entity of [...this.entities.values()]) {
      const rX = entity.kind === "circle" ? entity.radius : entity.width / 2;
      const rY = entity.kind === "circle" ? entity.radius : entity.height / 2;
      const outLeft = entity.x + rX < 0;
      const outRight = entity.x - rX > width;
      const outTop = entity.y + rY < 0;
      const outBottom = entity.y - rY > height;
      const outside = outLeft || outRight || outTop || outBottom;
      if (outside) this.dispatch("entityExit", { target: entity.id });

      switch (entity.bounds) {
        case "destroy":
          if (outside) this.entities.delete(entity.id);
          break;
        case "wrap":
          if (outLeft) entity.x = width + rX;
          if (outRight) entity.x = -rX;
          if (outTop) entity.y = height + rY;
          if (outBottom) entity.y = -rY;
          break;
        case "clamp":
          entity.x = Math.min(width - rX, Math.max(rX, entity.x));
          entity.y = Math.min(height - rY, Math.max(rY, entity.y));
          break;
        case "bounce":
          if (entity.x - rX <= 0 || entity.x + rX >= width) entity.vx *= -1;
          if (entity.y - rY <= 0 || entity.y + rY >= height) entity.vy *= -1;
          entity.x = Math.min(width - rX, Math.max(rX, entity.x));
          entity.y = Math.min(height - rY, Math.max(rY, entity.y));
          break;
        default:
          break;
      }
    }
  }

  detectCollisions() {
    const entities = [...this.entities.values()];
    const current = new Set();
    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        const a = entities[i];
        const b = entities[j];
        if (!collides(a, b)) continue;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        current.add(key);
        if (!this.lastCollisions.has(key)) this.dispatch("collision", { a: a.id, b: b.id });
      }
    }
    this.lastCollisions = current;
  }

  normalizeRuleEvent(rule, type, event) {
    if (type !== "collision" || !rule?.aTag || !rule?.bTag) return event;
    const a = this.entities.get(event.a);
    const b = this.entities.get(event.b);
    const direct = hasTag(a, rule.aTag) && hasTag(b, rule.bTag);
    if (direct) return event;
    const reverse = hasTag(a, rule.bTag) && hasTag(b, rule.aTag);
    return reverse ? { ...event, a: event.b, b: event.a } : event;
  }

  dispatch(type, event) {
    if (this.status !== "running") return;
    this.onEvent({ type, elapsedMs: this.elapsedMs, ...event });
    const rules = this.spec.rules || [];
    for (const rule of rules) {
      if (this.status !== "running") return;
      const normalizedEvent = this.normalizeRuleEvent(rule, type, event);

      if (typeof this.matchEventForRule === "function") {
        const matchedEvent = this.matchEventForRule(rule, type, normalizedEvent);
        if (!matchedEvent) continue;
        this.executeActions(rule.actions, matchedEvent);
        continue;
      }

      if (!this.ruleMatches(rule, type, normalizedEvent)) continue;
      this.executeActions(rule.actions, normalizedEvent);
    }
  }

  ruleMatches(rule, type, event) {
    if (rule.on !== type) return false;
    if (rule.timerId && rule.timerId !== event.timerId) return false;
    if (rule.targetTag) {
      const target = this.entities.get(event.target);
      if (!hasTag(target, rule.targetTag)) return false;
    }
    if (type === "collision") {
      const a = this.entities.get(event.a);
      const b = this.entities.get(event.b);
      if (rule.aTag && rule.bTag) {
        const direct = hasTag(a, rule.aTag) && hasTag(b, rule.bTag);
        const reverse = hasTag(a, rule.bTag) && hasTag(b, rule.aTag);
        if (!direct && !reverse) return false;
      } else {
        if (rule.aTag && !hasTag(a, rule.aTag) && !hasTag(b, rule.aTag)) return false;
        if (rule.bTag && !hasTag(a, rule.bTag) && !hasTag(b, rule.bTag)) return false;
      }
    }
    return !rule.condition || this.evaluateCondition(rule.condition, event);
  }

  evaluateExpression(expr, event) {
    this.bumpOps();
    if (expr === null || typeof expr !== "object" || Array.isArray(expr)) return expr;
    if (Object.hasOwn(expr, "var")) return this.variables[expr.var];
    if (Object.hasOwn(expr, "event")) return event[expr.event];
    if (Object.hasOwn(expr, "random")) {
      const [min, max] = expr.random;
      return min + this.random() * (max - min);
    }
    for (const op of ["add", "sub", "mul", "div", "min", "max"]) {
      if (!Object.hasOwn(expr, op)) continue;
      const values = expr[op].map((value) => Number(this.evaluateExpression(value, event)));
      if (op === "add") return values.reduce((sum, value) => sum + value, 0);
      if (op === "sub") return values.slice(1).reduce((value, item) => value - item, values[0]);
      if (op === "mul") return values.reduce((value, item) => value * item, 1);
      if (op === "div") return values.slice(1).reduce((value, item) => item === 0 ? value : value / item, values[0]);
      if (op === "min") return Math.min(...values);
      if (op === "max") return Math.max(...values);
    }
    return null;
  }

  evaluateCondition(condition, event) {
    this.bumpOps();
    if (condition.all) return condition.all.every((child) => this.evaluateCondition(child, event));
    if (condition.any) return condition.any.some((child) => this.evaluateCondition(child, event));
    if (condition.not) return !this.evaluateCondition(condition.not, event);
    const left = this.evaluateExpression(condition.left, event);
    const right = this.evaluateExpression(condition.right, event);
    switch (condition.op) {
      case "==": return left === right;
      case "!=": return left !== right;
      case ">": return left > right;
      case ">=": return left >= right;
      case "<": return left < right;
      case "<=": return left <= right;
      default: return false;
    }
  }

  resolveEntityRef(ref, event) {
    if (ref === "$target") return event.target;
    if (ref === "$a") return event.a;
    if (ref === "$b") return event.b;
    return ref;
  }

  executeActions(actions, event) {
    for (const action of actions || []) {
      if (this.status !== "running") return;
      this.bumpOps();
      const [type] = Object.keys(action);
      const value = action[type];
      switch (type) {
        case "setVar":
          this.variables[value.name] = this.evaluateExpression(value.value, event);
          break;
        case "addVar":
          this.variables[value.name] = Number(this.variables[value.name] || 0) + Number(this.evaluateExpression(value.value, event) || 0);
          break;
        case "setEntity":
        case "moveEntity":
        case "setVelocity": {
          const id = this.resolveEntityRef(value.entity, event);
          const entity = this.entities.get(id);
          if (!entity) break;
          for (const key of ["x", "y", "vx", "vy", "rotation", "opacity"]) {
            if (value[key] === undefined) continue;
            const next = Number(this.evaluateExpression(value[key], event));
            if (type === "moveEntity" && ["x", "y"].includes(key)) entity[key] += next;
            else entity[key] = next;
          }
          break;
        }
        case "spawn": {
          if (this.entities.size >= HARD_LIMITS.maxEntities) break;
          const template = this.spec.templates?.[value.template];
          if (!template) break;
          const id = value.id || `spawn-${this.nextEntityId++}`;
          const entity = this.normalizeEntity({ ...clone(template), id });
          for (const key of ["x", "y", "vx", "vy"]) {
            if (value[key] !== undefined) entity[key] = Number(this.evaluateExpression(value[key], event));
          }
          this.entities.set(id, entity);
          this.onEffect({ type: "spawn", entity: clone(entity) });
          break;
        }
        case "destroy": {
          const id = this.resolveEntityRef(value.entity, event);
          if (id) this.entities.delete(id);
          break;
        }
        case "emit":
          this.onEffect({ type: "emit", name: value.name, data: clone(value.data || {}) });
          break;
        case "sound":
          this.onEffect({ type: "sound", asset: value.asset, volume: value.volume ?? 1 });
          break;
        case "haptic":
          this.onEffect({ type: "haptic", pattern: [...value.pattern] });
          break;
        case "complete":
          this.finish("complete", value, event);
          break;
        case "fail":
          this.finish("fail", value, event);
          break;
        case "if":
          this.executeActions(this.evaluateCondition(value.condition, event) ? value.then : (value.else || []), event);
          break;
        default:
          break;
      }
    }
  }

  finish(status, payload, event) {
    this.status = status;
    this.result = {
      score: payload?.score === undefined ? 0 : Number(this.evaluateExpression(payload.score, event) || 0),
      detail: payload?.detail || "",
      elapsedMs: Math.round(this.elapsedMs),
    };
    this.onEffect({ type: status, ...clone(this.result) });
  }

  bumpOps() {
    this.operationCount += 1;
    if (this.operationCount > HARD_LIMITS.maxOpsPerStep) {
      this.status = "failed";
      this.result = { score: 0, detail: "Runtime operation budget exceeded", elapsedMs: Math.round(this.elapsedMs) };
      throw new Error("Sandbox runtime operation budget exceeded");
    }
  }

  snapshot() {
    return {
      status: this.status,
      elapsedMs: this.elapsedMs,
      variables: clone(this.variables),
      entities: [...this.entities.values()].map(clone),
      result: clone(this.result),
    };
  }
}
