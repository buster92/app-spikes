import { HARD_LIMITS, packageProfile } from "./game-spec.js";
import { SandboxRuntime } from "./runtime-core.js";

const DEFAULT_SEEDS = Object.freeze([1, 7, 42, 99, 1337]);

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

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function probeInput(runtime, spec, random, simulatedMs) {
  const width = spec.canvas.width;
  const height = spec.canvas.height;

  // Exercise pointer-driven rules without trying to solve the game. This is a
  // safety/runtime probe, not a playability bot.
  if (simulatedMs % 250 === 0) {
    runtime.pointer("pointerMove", random() * width, random() * height, {
      dx: (random() - 0.5) * width * 0.15,
      dy: (random() - 0.5) * height * 0.15,
    });
  }
  if (simulatedMs % 750 === 0) {
    const x = random() * width;
    const y = random() * height;
    runtime.pointer("pointerDown", x, y);
    runtime.pointer("pointerUp", x, y);
    runtime.pointer("tap", x, y);
  }
}

export function reviewGameSpec(spec, options = {}) {
  const profile = packageProfile(spec);
  const seeds = Array.isArray(options.seeds) && options.seeds.length
    ? options.seeds.map((seed) => Number(seed) >>> 0)
    : [...DEFAULT_SEEDS];
  const stepMs = clamp(Number(options.stepMs || 50), 16, HARD_LIMITS.maxStepMs);
  const maxSimulatedMs = clamp(
    Number(options.maxSimulatedMs || Math.min(HARD_LIMITS.maxDurationMs, 15_000)),
    stepMs,
    HARD_LIMITS.maxDurationMs,
  );

  if (!profile.ok) {
    return {
      ok: false,
      verdict: "reject",
      stage: "static_validation",
      profile,
      runs: [],
      errors: [...profile.errors],
      warnings: [],
      summary: {
        seeds: 0,
        crashes: 0,
        terminalRuns: 0,
        completes: 0,
        fails: 0,
        peakEntities: 0,
        peakOps: 0,
      },
    };
  }

  const runs = [];
  const errors = [];
  const warnings = [];

  for (const seed of seeds) {
    const eventCounts = {};
    const effectCounts = {};
    const random = mulberry32(seed ^ 0x9E3779B9);
    let peakEntities = 0;
    let peakOps = 0;
    let crash = null;
    let runtime = null;

    try {
      runtime = new SandboxRuntime(spec, {
        seed,
        onEvent: (event) => increment(eventCounts, event.type),
        onEffect: (effect) => increment(effectCounts, effect.type),
      });
      runtime.start();
      peakEntities = runtime.entities.size;

      for (let simulatedMs = 0; simulatedMs < maxSimulatedMs && runtime.status === "running"; simulatedMs += stepMs) {
        runtime.step(stepMs);
        peakOps = Math.max(peakOps, runtime.operationCount);
        peakEntities = Math.max(peakEntities, runtime.entities.size);
        probeInput(runtime, spec, random, simulatedMs);
        peakOps = Math.max(peakOps, runtime.operationCount);
        peakEntities = Math.max(peakEntities, runtime.entities.size);
      }
    } catch (error) {
      crash = error?.message ? String(error.message) : String(error);
      errors.push(`seed ${seed}: ${crash}`);
    }

    const snapshot = runtime?.snapshot?.() || null;
    runs.push({
      seed,
      crashed: Boolean(crash),
      crash,
      status: snapshot?.status || "not_started",
      elapsedMs: Math.round(snapshot?.elapsedMs || 0),
      result: snapshot?.result || null,
      peakEntities,
      peakOps,
      eventCounts,
      effectCounts,
    });
  }

  const crashes = runs.filter((run) => run.crashed).length;
  const completes = runs.filter((run) => run.status === "complete").length;
  const fails = runs.filter((run) => run.status === "fail").length;
  const terminalRuns = completes + fails;
  const peakEntities = Math.max(0, ...runs.map((run) => run.peakEntities));
  const peakOps = Math.max(0, ...runs.map((run) => run.peakOps));

  if (terminalRuns === 0) {
    warnings.push("Probe runs did not reach a terminal state; this is not a rejection, but playability needs a targeted bot or human check.");
  }
  if (peakEntities >= Math.floor(HARD_LIMITS.maxEntities * 0.9)) {
    warnings.push("Runtime entity usage reaches at least 90% of the hard limit.");
  }
  if (peakOps >= Math.floor(HARD_LIMITS.maxOpsPerStep * 0.9)) {
    warnings.push("Runtime operation usage reaches at least 90% of the per-step hard limit.");
  }

  const ok = crashes === 0;
  return {
    ok,
    verdict: ok ? (warnings.length ? "pass_with_warnings" : "pass") : "reject",
    stage: "automated_runtime_review",
    profile,
    runs,
    errors,
    warnings,
    summary: {
      seeds: runs.length,
      crashes,
      terminalRuns,
      completes,
      fails,
      peakEntities,
      peakOps,
      maxSimulatedMs,
      stepMs,
    },
  };
}
