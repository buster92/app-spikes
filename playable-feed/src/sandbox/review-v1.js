import { HARD_LIMITS } from "./game-spec.js";
import { packageProfileV1, RUNTIME_V1_ID, validatePublicationPolicyV1 } from "./game-spec-v1.js";
import { reviewWithRuntime } from "./review-engine.js";
import { SafeSandboxRuntimeV1 } from "./runtime-v1.js";

const V1_REVIEW_ADAPTER = Object.freeze({
  profileSpec: packageProfileV1,
  validatePublication: validatePublicationPolicyV1,
  RuntimeClass: SafeSandboxRuntimeV1,
  limits: HARD_LIMITS,
  runtimeLabel: RUNTIME_V1_ID,
});

export function reviewGameSpecV1(spec, options = {}) {
  return reviewWithRuntime(spec, V1_REVIEW_ADAPTER, options);
}
