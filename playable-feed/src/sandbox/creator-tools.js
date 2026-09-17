import { ASSET_POLICY } from "./asset-contract.js";
import {
  ALLOWED_ACTIONS,
  ALLOWED_EVENTS,
  HARD_LIMITS,
  RUNTIME_ID,
  packageProfile,
} from "./game-spec.js";
import { validatePublicationPolicy } from "./publication-policy.js";
import { reviewGameSpec } from "./review.js";
import { buildTransportPlan, buildUnsignedPublicationManifest } from "./transport.js";

const ENTITY_KINDS = Object.freeze(["circle", "rect", "text", "sprite"]);
const BOUNDS_MODES = Object.freeze(["none", "clamp", "bounce", "wrap", "destroy"]);

function classifyDiagnostic(message = "") {
  const lower = String(message).toLowerCase();
  if (lower.includes("unknown field")) return "UNKNOWN_FIELD";
  if (lower.includes("duplicate")) return "DUPLICATE_ID";
  if (lower.includes("references unknown asset") || lower.includes("unknown asset")) return "UNKNOWN_ASSET";
  if (lower.includes("references unknown timer") || lower.includes("unknown timer")) return "UNKNOWN_TIMER";
  if (lower.includes("references unknown template") || lower.includes("unknown template")) return "UNKNOWN_TEMPLATE";
  if (lower.includes("references unknown entity") || lower.includes("unknown entity")) return "UNKNOWN_ENTITY";
  if (lower.includes("source rectangle exceeds")) return "ATLAS_FRAME_OUT_OF_BOUNDS";
  if (lower.includes("source") && lower.includes("requires")) return "INCOMPLETE_ATLAS_FRAME";
  if (lower.includes("sha256") || lower.includes("content reference")) return "INVALID_ASSET_REF";
  if (lower.includes("decoded raster") || lower.includes("declared asset bytes") || lower.includes("exceed") || lower.includes("max ")) return "BUDGET_EXCEEDED";
  if (lower.includes("unsupported")) return "UNSUPPORTED_VALUE";
  if (lower.includes("must be") || lower.includes("invalid")) return "INVALID_VALUE";
  return "VALIDATION_ERROR";
}

function parsePath(message = "") {
  const text = String(message);
  const colon = text.indexOf(":");
  if (colon <= 0) return null;
  const candidate = text.slice(0, colon).trim();
  if (!/^[a-zA-Z0-9_$.[\]-]+$/.test(candidate)) return null;
  return candidate;
}

export function structuredDiagnostic(message, { severity = "error", stage = "validation" } = {}) {
  return {
    severity,
    stage,
    path: parsePath(message),
    code: classifyDiagnostic(message),
    message: String(message),
  };
}

export function getRuntimeCapabilities() {
  return {
    runtime: RUNTIME_ID,
    schemaVersion: 1,
    wireFormat: "GameSpec JSON",
    entityKinds: [...ENTITY_KINDS],
    boundsModes: [...BOUNDS_MODES],
    events: [...ALLOWED_EVENTS],
    actions: [...ALLOWED_ACTIONS],
    assets: {
      kinds: ["image", "audio"],
      imageMime: [...ASSET_POLICY.allowedImageMime],
      audioMime: [...ASSET_POLICY.allowedAudioMime],
      maxAssets: ASSET_POLICY.maxAssets,
      maxDeclaredAssetBytes: ASSET_POLICY.maxDeclaredAssetBytes,
      maxSingleImageBytes: ASSET_POLICY.maxSingleImageBytes,
      maxSingleAudioBytes: ASSET_POLICY.maxSingleAudioBytes,
      maxRasterDimension: ASSET_POLICY.maxRasterDimension,
      maxSingleDecodedImageBytes: ASSET_POLICY.maxSingleDecodedImageBytes,
      maxTotalDecodedImageBytes: ASSET_POLICY.maxTotalDecodedImageBytes,
      addressing: "sha256",
      arbitraryUrls: false,
    },
    budgets: { ...HARD_LIMITS },
    sandbox: {
      arbitraryCode: false,
      network: false,
      dom: false,
      filesystem: false,
      storage: false,
      socialApi: false,
      payments: false,
      deviceIdentity: false,
    },
  };
}

export function validateForAuthoring(spec) {
  let profile;
  try {
    profile = packageProfile(spec);
  } catch (error) {
    const diagnostic = structuredDiagnostic(error?.message || String(error), { stage: "schema" });
    return {
      ok: false,
      runtime: RUNTIME_ID,
      diagnostics: [diagnostic],
      warnings: [],
      profile: null,
      transport: null,
    };
  }

  const diagnostics = (profile.errors || []).map((message) => structuredDiagnostic(message, { stage: "schema" }));
  let publication = { ok: false, errors: [], warnings: [] };
  let transport = null;

  if (profile.ok) {
    publication = validatePublicationPolicy(spec);
    diagnostics.push(...(publication.errors || []).map((message) => structuredDiagnostic(message, { stage: "publication_policy" })));
    if (publication.ok) transport = buildTransportPlan(spec);
  }

  const warnings = (publication.warnings || []).map((message) => structuredDiagnostic(message, {
    severity: "warning",
    stage: "publication_policy",
  }));

  return {
    ok: profile.ok && publication.ok,
    runtime: spec?.runtime || null,
    diagnostics,
    warnings,
    profile,
    transport: transport ? {
      feedDescriptor: transport.feedDescriptor,
      feedDescriptorBytes: transport.feedDescriptorBytes,
      canonicalSpecBytes: transport.canonicalSpecBytes,
      declaredAssetBytes: transport.declaredAssetBytes,
      uncachedAssetBytes: transport.uncachedAssetBytes,
      firstPlayBytes: transport.firstPlayBytes,
      instantEligible: transport.profile.instantEligible,
    } : null,
  };
}

export function simulateForAuthoring(spec, options = {}) {
  const validation = validateForAuthoring(spec);
  if (!validation.ok) {
    return {
      ok: false,
      verdict: "reject",
      stage: "validation",
      validation,
      diagnostics: validation.diagnostics,
      warnings: validation.warnings,
      summary: null,
      runs: [],
    };
  }

  const review = reviewGameSpec(spec, options);
  const diagnostics = (review.errors || []).map((message) => structuredDiagnostic(message, { stage: review.stage || "simulation" }));
  const warnings = (review.warnings || []).map((message) => structuredDiagnostic(message, {
    severity: "warning",
    stage: review.stage || "simulation",
  }));

  return {
    ok: review.ok,
    verdict: review.verdict,
    stage: review.stage,
    validation,
    diagnostics,
    warnings,
    summary: review.summary,
    runs: review.runs,
  };
}

export async function buildPublicationCandidate(spec) {
  const validation = validateForAuthoring(spec);
  if (!validation.ok) {
    return {
      ok: false,
      diagnostics: validation.diagnostics,
      warnings: validation.warnings,
      manifest: null,
    };
  }

  return {
    ok: true,
    diagnostics: [],
    warnings: validation.warnings,
    manifest: await buildUnsignedPublicationManifest(spec),
  };
}
