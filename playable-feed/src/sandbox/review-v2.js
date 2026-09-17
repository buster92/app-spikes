import { HARD_LIMITS } from "./game-spec.js";
import { packageProfileV2, RUNTIME_V2_ID, validatePublicationPolicyV2 } from "./game-spec-v2.js";
import { reviewWithRuntime } from "./review-engine.js";
import { SafeSandboxRuntimeV2 } from "./runtime-v2.js";

const V2_REVIEW_ADAPTER = Object.freeze({
  profileSpec: packageProfileV2,
  validatePublication: validatePublicationPolicyV2,
  RuntimeClass: SafeSandboxRuntimeV2,
  limits: HARD_LIMITS,
  runtimeLabel: RUNTIME_V2_ID,
});

export function reviewGameSpecV2(spec, options = {}) {
  return reviewWithRuntime(spec, V2_REVIEW_ADAPTER, options);
}
