import { HARD_LIMITS } from "./game-spec.js";
import { RUNTIME_V2_ID } from "./game-spec-v2.js";
import {
  runReplayWithRuntime,
  stableRuntimeSnapshot,
  validateReplayTraceForRuntime,
} from "./replay-engine.js";
import { SafeSandboxRuntimeV2 } from "./runtime-v2.js";

const V2_REPLAY_ADAPTER = Object.freeze({
  runtimeId: RUNTIME_V2_ID,
  RuntimeClass: SafeSandboxRuntimeV2,
  limits: HARD_LIMITS,
});

export { stableRuntimeSnapshot };

export function validateReplayTraceV2(spec, trace) {
  return validateReplayTraceForRuntime(spec, trace, V2_REPLAY_ADAPTER);
}

export function runReplayV2(spec, trace) {
  return runReplayWithRuntime(spec, trace, V2_REPLAY_ADAPTER);
}
