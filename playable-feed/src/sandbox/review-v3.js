import { HARD_LIMITS } from "./game-spec.js";
import { packageProfileV3, RUNTIME_V3_ID, validatePublicationPolicyV3 } from "./game-spec-v3.js";
import { reviewWithRuntime } from "./review-engine.js";
import { SafeSandboxRuntimeV3 } from "./runtime-v3.js";

const V3_REVIEW_ADAPTER = Object.freeze({
  profileSpec: packageProfileV3,
  validatePublication: validatePublicationPolicyV3,
  RuntimeClass: SafeSandboxRuntimeV3,
  limits: HARD_LIMITS,
  runtimeLabel: RUNTIME_V3_ID,
});

export function reviewGameSpecV3(spec, options = {}) {
  return reviewWithRuntime(spec, V3_REVIEW_ADAPTER, options);
}
