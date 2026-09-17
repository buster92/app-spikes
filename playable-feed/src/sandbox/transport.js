import { packageProfile, RUNTIME_ID } from "./game-spec.js";
import {
  packageProfileV1,
  RUNTIME_V1_ID,
  validatePublicationPolicyV1,
} from "./game-spec-v1.js";
import {
  packageProfileV2,
  RUNTIME_V2_ID,
  validatePublicationPolicyV2,
} from "./game-spec-v2.js";
import {
  packageProfileV3,
  RUNTIME_V3_ID,
  validatePublicationPolicyV3,
} from "./game-spec-v3.js";
import { validatePublicationPolicy } from "./publication-policy.js";

const encoder = new TextEncoder();

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
  return output;
}

function runtimeAdapter(spec) {
  switch (spec?.runtime) {
    case RUNTIME_ID:
      return {
        profile: packageProfile,
        publication: validatePublicationPolicy,
      };
    case RUNTIME_V1_ID:
      return {
        profile: packageProfileV1,
        publication: validatePublicationPolicyV1,
      };
    case RUNTIME_V2_ID:
      return {
        profile: packageProfileV2,
        publication: validatePublicationPolicyV2,
      };
    case RUNTIME_V3_ID:
      return {
        profile: packageProfileV3,
        publication: validatePublicationPolicyV3,
      };
    default:
      throw new Error(`Unsupported GameSpec runtime '${spec?.runtime ?? "<missing>"}'`);
  }
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function utf8Bytes(value) {
  return encoder.encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

export function buildTransportPlan(spec, { cachedAssetRefs = [] } = {}) {
  const adapter = runtimeAdapter(spec);
  const profile = adapter.profile(spec);
  if (!profile.ok) throw new Error(`Invalid GameSpec:\n${profile.errors.join("\n")}`);
  const publication = adapter.publication(spec);
  if (!publication.ok) throw new Error(`GameSpec violates publication policy:\n${publication.errors.join("\n")}`);

  const cached = new Set(cachedAssetRefs);
  const specJson = canonicalJson(spec);
  const canonicalSpecBytes = utf8Bytes(specJson);
  const assets = (spec.assets || []).map((asset) => ({
    id: asset.id,
    ref: asset.ref,
    bytes: asset.bytes,
    cached: cached.has(asset.ref),
  }));
  const uncachedAssetBytes = assets
    .filter((asset) => !asset.cached)
    .reduce((sum, asset) => sum + Number(asset.bytes || 0), 0);

  // Planning descriptor: useful before a publication manifest exists. Public
  // feed records should use buildPublicationEnvelope() and resolve by hash.
  const feedDescriptor = {
    kind: "playable",
    gameId: spec.id,
    title: spec.title,
    runtime: spec.runtime,
    specBytes: canonicalSpecBytes,
    assetBytes: profile.metrics.declaredAssetBytes,
    assetCount: assets.length,
    instantEligible: profile.instantEligible,
  };

  return {
    profile,
    publicationPolicy: publication,
    canonicalSpecBytes,
    feedDescriptor,
    feedDescriptorBytes: utf8Bytes(feedDescriptor),
    declaredAssetBytes: profile.metrics.declaredAssetBytes,
    uncachedAssetBytes,
    firstPlayBytes: canonicalSpecBytes + uncachedAssetBytes,
    cachedAssetSavingsBytes: profile.metrics.declaredAssetBytes - uncachedAssetBytes,
    assets,
  };
}

export async function sha256Ref(value) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 requires Web Crypto support");
  const bytes = encoder.encode(typeof value === "string" ? value : canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function buildUnsignedPublicationManifest(spec) {
  const plan = buildTransportPlan(spec);
  const canonical = canonicalJson(spec);
  return {
    manifestVersion: 1,
    runtime: spec.runtime,
    gameId: spec.id,
    title: spec.title,
    specRef: await sha256Ref(canonical),
    specBytes: plan.canonicalSpecBytes,
    assets: plan.assets.map(({ id, ref, bytes }) => ({ id, ref, bytes })),
    totalDeclaredBytes: plan.canonicalSpecBytes + plan.declaredAssetBytes,
    instantEligible: plan.profile.instantEligible,
  };
}

export async function buildPublicationEnvelope(spec) {
  const manifest = await buildUnsignedPublicationManifest(spec);
  const manifestRef = await sha256Ref(manifest);
  const assetBytes = manifest.assets.reduce((sum, asset) => sum + Number(asset.bytes || 0), 0);

  // This is the record a social post can carry. The manifest, GameSpec and
  // creator assets remain lazy/content-addressed and can live behind a CDN.
  const feedDescriptor = {
    kind: "playable",
    manifestVersion: manifest.manifestVersion,
    gameId: manifest.gameId,
    title: manifest.title,
    runtime: manifest.runtime,
    manifestRef,
    specRef: manifest.specRef,
    specBytes: manifest.specBytes,
    assetBytes,
    assetCount: manifest.assets.length,
    instantEligible: manifest.instantEligible,
  };

  return {
    manifest,
    manifestRef,
    feedDescriptor,
    feedDescriptorBytes: utf8Bytes(feedDescriptor),
  };
}
