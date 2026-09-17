import { HARD_LIMITS } from "./game-spec.js";
import { RUNTIME_V1_ID } from "./game-spec-v1.js";
import {
  runReplayWithRuntime,
  stableRuntimeSnapshot,
  validateReplayTraceForRuntime,
} from "./replay-engine.js";
import { SafeSandboxRuntimeV1 } from "./runtime-v1.js";

const V1_REPLAY_ADAPTER = Object.freeze({
  runtimeId: RUNTIME_V1_ID,
  RuntimeClass: SafeSandboxRuntimeV1,
  limits: HARD_LIMITS,
});

export { stableRuntimeSnapshot };

export function validateReplayTraceV1(spec, trace) {
  return validateReplayTraceForRuntime(spec, trace, V1_REPLAY_ADAPTER);
}

export function runReplayV1(spec, trace) {
  return runReplayWithRuntime(spec, trace, V1_REPLAY_ADAPTER);
}
