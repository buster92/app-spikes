export const ASSET_REF_RE = /^sha256:[0-9a-f]{64}$/;

export const ASSET_POLICY = Object.freeze({
  maxAssets: 24,
  maxDeclaredAssetBytes: 256 * 1024,
  maxSingleImageBytes: 96 * 1024,
  maxSingleAudioBytes: 128 * 1024,
  maxRasterDimension: 1024,
  allowedImageMime: Object.freeze(["image/png", "image/webp", "image/avif"]),
  allowedAudioMime: Object.freeze(["audio/ogg", "audio/webm", "audio/mp4"]),
});

export function isTrustedAssetRef(value) {
  return typeof value === "string" && ASSET_REF_RE.test(value);
}

export function assetBudgetForKind(kind) {
  if (kind === "image") return ASSET_POLICY.maxSingleImageBytes;
  if (kind === "audio") return ASSET_POLICY.maxSingleAudioBytes;
  return 0;
}

export function validateNormalizedAssetMetadata(asset, path = "asset") {
  const errors = [];
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return [`${path}: must be an object`];
  if (!isTrustedAssetRef(asset.ref)) errors.push(`${path}.ref: must be a full lowercase sha256 content reference`);
  if (!["image", "audio"].includes(asset.kind)) errors.push(`${path}.kind: must be image or audio`);
  if (!Number.isInteger(asset.bytes) || asset.bytes < 0) errors.push(`${path}.bytes: must be a non-negative integer`);
  const budget = assetBudgetForKind(asset.kind);
  if (budget && Number(asset.bytes || 0) > budget) errors.push(`${path}.bytes: exceeds ${budget} byte per-${asset.kind} instant budget`);
  if (asset.kind === "image") {
    if (!ASSET_POLICY.allowedImageMime.includes(asset.mime)) errors.push(`${path}.mime: must be a normalized raster type`);
    for (const key of ["width", "height"]) {
      if (!Number.isInteger(asset[key]) || asset[key] < 1 || asset[key] > ASSET_POLICY.maxRasterDimension) {
        errors.push(`${path}.${key}: must be 1–${ASSET_POLICY.maxRasterDimension}`);
      }
    }
  }
  if (asset.kind === "audio" && !ASSET_POLICY.allowedAudioMime.includes(asset.mime)) {
    errors.push(`${path}.mime: must be an approved normalized audio type`);
  }
  return errors;
}
