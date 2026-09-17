import { HARD_LIMITS } from "./game-spec.js";
import { RUNTIME_V3_ID } from "./game-spec-v3.js";
import {
  runReplayWithRuntime,
  stableRuntimeSnapshot,
  validateReplayTraceForRuntime,
} from "./replay-engine.js";
import { SafeSandboxRuntimeV3 } from "./runtime-v3.js";

const V3_REPLAY_ADAPTER = Object.freeze({
  runtimeId: RUNTIME_V3_ID,
  RuntimeClass: SafeSandboxRuntimeV3,
  limits: HARD_LIMITS,
});

export { stableRuntimeSnapshot };

export function validateReplayTraceV3(spec, trace) {
  return validateReplayTraceForRuntime(spec, trace, V3_REPLAY_ADAPTER);
}

export function runReplayV3(spec, trace) {
  return runReplayWithRuntime(spec, trace, V3_REPLAY_ADAPTER);
}
