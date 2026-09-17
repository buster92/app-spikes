import { packageProfile } from "./game-spec.js";
import { validatePublicationPolicy } from "./publication-policy.js";

const encoder = new TextEncoder();

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
  return output;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function utf8Bytes(value) {
  return encoder.encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

export function buildTransportPlan(spec, { cachedAssetRefs = [] } = {}) {
  const profile = packageProfile(spec);
  if (!profile.ok) throw new Error(`Invalid GameSpec:\n${profile.errors.join("\n")}`);
  const publication = validatePublicationPolicy(spec);
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

  // This is the small record the social feed needs before a player expresses
  // intent. The actual GameSpec/assets stay lazy and content-addressed.
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
