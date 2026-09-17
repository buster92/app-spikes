import { HARD_LIMITS } from "./game-spec.js";
import { SandboxRuntime } from "./runtime-core.js";

export const HOST_EFFECT_LIMITS = Object.freeze({
  haptic: 8,
  sound: 12,
  emit: 32,
  spawn: 128,
});

function hasTag(entity, tag) {
  return Boolean(tag) && entity?.tags?.includes(tag);
}

function overlaps(a, b) {
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

export class SafeSandboxRuntime extends SandboxRuntime {
  constructor(spec, options = {}) {
    const downstreamEffect = options.onEffect || (() => {});
    super(spec, { ...options, onEffect: () => {} });
    this.downstreamEffect = downstreamEffect;
    this.effectWindowStartedAtMs = 0;
    this.effectWindowCounts = new Map();
    this.suppressedHostEffects = 0;
    this.onEffect = (effect) => this.forwardHostEffect(effect);
  }

  forwardHostEffect(effect) {
    const type = effect?.type;
    if (!type || type === "complete" || type === "fail") {
      this.downstreamEffect(effect);
      return;
    }

    if (this.elapsedMs - this.effectWindowStartedAtMs >= 1000) {
      this.effectWindowStartedAtMs = this.elapsedMs;
      this.effectWindowCounts.clear();
    }

    const limit = HOST_EFFECT_LIMITS[type];
    if (!limit) {
      this.downstreamEffect(effect);
      return;
    }

    const count = this.effectWindowCounts.get(type) || 0;
    if (count >= limit) {
      this.suppressedHostEffects += 1;
      return;
    }
    this.effectWindowCounts.set(type, count + 1);
    this.downstreamEffect(effect);
  }

  safetyStats() {
    return {
      suppressedHostEffects: this.suppressedHostEffects,
      effectWindowStartedAtMs: this.effectWindowStartedAtMs,
      effectWindowCounts: Object.fromEntries(this.effectWindowCounts),
    };
  }

  normalizeEntity(entity) {
    const normalized = super.normalizeEntity(entity);
    if (entity?.kind === "sprite") {
      normalized.asset = entity.asset;
      normalized.kind = "sprite";
      for (const key of ["sourceX", "sourceY", "sourceWidth", "sourceHeight"]) {
        if (entity[key] !== undefined) normalized[key] = Number(entity[key]);
      }
    }
    normalized.collidable = entity?.collidable !== false;
    normalized.interactive = entity?.interactive !== false;
    return normalized;
  }

  entityAt(x, y) {
    const entities = [...this.entities.values()].reverse();
    return entities.find((entity) => {
      if (entity.interactive === false) return false;
      if (entity.kind === "circle") return (x - entity.x) ** 2 + (y - entity.y) ** 2 <= entity.radius ** 2;
      const halfW = (entity.width || 0) / 2;
      const halfH = (entity.height || 0) / 2;
      return x >= entity.x - halfW && x <= entity.x + halfW && y >= entity.y - halfH && y <= entity.y + halfH;
    }) || null;
  }

  detectCollisions() {
    const entities = [...this.entities.values()].filter((entity) => entity.collidable !== false);
    const current = new Set();
    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        const a = entities[i];
        const b = entities[j];
        if (!overlaps(a, b)) continue;
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

    for (const rule of this.spec.rules || []) {
      if (this.status !== "running") return;
      const normalizedEvent = this.normalizeRuleEvent(rule, type, event);

      if (typeof this.matchEventForRule === "function") {
        const matchedEvent = this.matchEventForRule(rule, type, normalizedEvent);
        if (!matchedEvent) continue;
        this.executeActions(rule.actions, matchedEvent);
        continue;
      }

      if (typeof this.ruleMatches !== "function" || !this.ruleMatches(rule, type, normalizedEvent)) continue;
      this.executeActions(rule.actions, normalizedEvent);
    }
  }

  step(deltaMs) {
    if (this.status !== "running") return;
    const remaining = HARD_LIMITS.maxDurationMs - this.elapsedMs;
    if (remaining <= 0) {
      this.endForRuntimeLimit();
      return;
    }
    super.step(Math.min(Number(deltaMs) || 0, remaining));
    if (this.status === "running" && this.elapsedMs >= HARD_LIMITS.maxDurationMs) this.endForRuntimeLimit();
  }

  endForRuntimeLimit() {
    if (this.status !== "running") return;
    this.status = "fail";
    this.result = {
      score: Number(this.variables.score || 0),
      detail: "Runtime time limit reached",
      elapsedMs: Math.round(this.elapsedMs),
      reason: "runtime_time_limit",
    };
    this.onEffect({ type: "fail", ...this.result });
  }
}
