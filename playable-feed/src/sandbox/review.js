import { HARD_LIMITS, packageProfile } from "./game-spec.js";
import { validatePublicationPolicy } from "./publication-policy.js";
import { reviewWithRuntime } from "./review-engine.js";
import { SafeSandboxRuntime } from "./safe-runtime.js";

const V0_REVIEW_ADAPTER = Object.freeze({
  profileSpec: packageProfile,
  validatePublication: validatePublicationPolicy,
  RuntimeClass: SafeSandboxRuntime,
  limits: HARD_LIMITS,
  runtimeLabel: "playloop-2d-v0",
});

export function reviewGameSpec(spec, options = {}) {
  return reviewWithRuntime(spec, V0_REVIEW_ADAPTER, options);
}
