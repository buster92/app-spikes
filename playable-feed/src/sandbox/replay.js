import { HARD_LIMITS, RUNTIME_ID } from "./game-spec.js";
import {
  runReplayWithRuntime,
  stableRuntimeSnapshot,
  validateReplayTraceForRuntime,
} from "./replay-engine.js";
import { SafeSandboxRuntime } from "./safe-runtime.js";

const V0_REPLAY_ADAPTER = Object.freeze({
  runtimeId: RUNTIME_ID,
  RuntimeClass: SafeSandboxRuntime,
  limits: HARD_LIMITS,
});

export { stableRuntimeSnapshot };

export function validateReplayTrace(spec, trace) {
  return validateReplayTraceForRuntime(spec, trace, V0_REPLAY_ADAPTER);
}

export function runReplay(spec, trace) {
  return runReplayWithRuntime(spec, trace, V0_REPLAY_ADAPTER);
}
