import { HARD_LIMITS } from "./game-spec.js";

const POINTER_TYPES = new Set(["tap", "pointerDown", "pointerMove", "pointerUp"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function round(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return Math.round(value * 1e6) / 1e6;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return round(value);
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = stableValue(value[key]);
  return output;
}

export function stableRuntimeSnapshot(snapshot) {
  const copy = clone(snapshot) || {};
  if (Array.isArray(copy.entities)) copy.entities.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return stableValue(copy);
}

export function validateReplayTraceForRuntime(spec, trace, adapter) {
  const errors = [];
  const runtimeId = adapter?.runtimeId;
  const limits = adapter?.limits || HARD_LIMITS;
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return { ok: false, errors: ["trace: must be an object"] };
  if (!runtimeId) throw new Error("Replay adapter requires runtimeId");
  if (trace.formatVersion !== 1) errors.push("formatVersion: must be 1");
  if (trace.runtime !== runtimeId) errors.push(`runtime: must be ${runtimeId}`);
  if (trace.gameId !== spec?.id) errors.push(`gameId: expected ${spec?.id || "<unknown>"}`);
  if (!Number.isInteger(trace.seed) || trace.seed < 0 || trace.seed > 0xffffffff) errors.push("seed: must be an unsigned 32-bit integer");
  if (!Number.isInteger(trace.durationMs) || trace.durationMs < 0 || trace.durationMs > limits.maxDurationMs) {
    errors.push(`durationMs: must be 0-${limits.maxDurationMs}`);
  }

  const inputs = Array.isArray(trace.inputs) ? trace.inputs : [];
  if (!Array.isArray(trace.inputs)) errors.push("inputs: must be an array");
  if (inputs.length > 1000) errors.push("inputs: max 1000 events");
  for (const [index, input] of inputs.entries()) {
    const path = `inputs[${index}]`;
    if (!Number.isInteger(input?.atMs) || input.atMs < 0 || input.atMs > Number(trace.durationMs || 0)) errors.push(`${path}.atMs: outside replay duration`);
    if (!POINTER_TYPES.has(input?.type)) errors.push(`${path}.type: unsupported pointer event`);
    for (const key of ["x", "y", "dx", "dy"]) {
      if (input?.[key] !== undefined && (typeof input[key] !== "number" || !Number.isFinite(input[key]))) errors.push(`${path}.${key}: must be finite`);
    }
  }

  const captures = trace.captureAtMs === undefined ? [trace.durationMs] : trace.captureAtMs;
  if (!Array.isArray(captures)) errors.push("captureAtMs: must be an array");
  else if (captures.length > 128) errors.push("captureAtMs: max 128 timestamps");
  else {
    captures.forEach((atMs, index) => {
      if (!Number.isInteger(atMs) || atMs < 0 || atMs > Number(trace.durationMs || 0)) errors.push(`captureAtMs[${index}]: outside replay duration`);
    });
  }

  return { ok: errors.length === 0, errors };
}

export function runReplayWithRuntime(spec, trace, adapter) {
  const RuntimeClass = adapter?.RuntimeClass;
  const limits = adapter?.limits || HARD_LIMITS;
  if (typeof RuntimeClass !== "function") throw new Error("Replay adapter requires RuntimeClass");

  const validation = validateReplayTraceForRuntime(spec, trace, adapter);
  if (!validation.ok) throw new Error(`Invalid replay trace:\n${validation.errors.join("\n")}`);

  const runtime = new RuntimeClass(spec, { seed: trace.seed });
  runtime.start();

  const inputsByTime = new Map();
  (trace.inputs || []).forEach((input, index) => {
    const list = inputsByTime.get(input.atMs) || [];
    list.push({ ...input, _order: index });
    inputsByTime.set(input.atMs, list);
  });
  for (const list of inputsByTime.values()) list.sort((a, b) => a._order - b._order);

  const captureTimes = [...new Set(trace.captureAtMs === undefined ? [trace.durationMs] : trace.captureAtMs)].sort((a, b) => a - b);
  const timeline = [...new Set([...inputsByTime.keys(), ...captureTimes, trace.durationMs])].sort((a, b) => a - b);
  const captures = [];

  const advanceTo = (targetMs) => {
    while (runtime.status === "running" && runtime.elapsedMs < targetMs) {
      runtime.step(Math.min(limits.maxStepMs, targetMs - runtime.elapsedMs));
    }
  };

  for (const atMs of timeline) {
    advanceTo(atMs);
    if (runtime.status === "running") {
      for (const input of inputsByTime.get(atMs) || []) {
        const extra = {};
        if (input.dx !== undefined) extra.dx = input.dx;
        if (input.dy !== undefined) extra.dy = input.dy;
        runtime.pointer(input.type, Number(input.x || 0), Number(input.y || 0), extra);
      }
    }
    if (captureTimes.includes(atMs)) {
      captures.push({ atMs, snapshot: stableRuntimeSnapshot(runtime.snapshot()) });
    }
    if (runtime.status !== "running" && atMs < trace.durationMs) break;
  }

  return {
    replayFormatVersion: 1,
    runtime: trace.runtime,
    gameId: trace.gameId,
    seed: trace.seed,
    durationMs: trace.durationMs,
    ordering: "advance timers/physics/collisions to timestamp, then apply input events in trace order, then capture",
    captures,
    final: stableRuntimeSnapshot(runtime.snapshot()),
  };
}
