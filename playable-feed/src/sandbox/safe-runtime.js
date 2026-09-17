import { HARD_LIMITS } from "./game-spec.js";
import { SandboxRuntime } from "./runtime-core.js";

function hasTag(entity, tag) {
  return Boolean(tag) && entity?.tags?.includes(tag);
}

export class SafeSandboxRuntime extends SandboxRuntime {
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

      // Keep the safety envelope compatible with the small v0 runtime core as
      // its matcher is refactored. Public semantics stay the same: aTag/bTag
      // define $a/$b roles, regardless of entity insertion order.
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
