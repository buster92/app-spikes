import { ASSET_POLICY, isTrustedAssetRef } from "./asset-contract.js";

const encoder = new TextEncoder();

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("Trusted asset verification requires Web Crypto");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${hex(new Uint8Array(digest))}`;
}

function assertSameOrigin(url) {
  const resolved = new URL(url, globalThis.location?.href || "http://localhost/");
  if (globalThis.location && resolved.origin !== globalThis.location.origin) {
    throw new Error("Demo trusted asset catalog may only resolve same-origin URLs");
  }
  return resolved.toString();
}

export function createTrustedAssetLoader(catalog = {}) {
  const entries = new Map(Object.entries(catalog));
  const inflight = new Map();
  const decoded = new Map();

  async function fetchVerified(asset) {
    if (!asset || !isTrustedAssetRef(asset.ref)) throw new Error("Invalid content-addressed asset reference");
    const catalogEntry = entries.get(asset.ref);
    if (!catalogEntry) throw new Error(`Asset ${asset.ref} is not present in the host-controlled catalog`);
    if (catalogEntry.kind !== asset.kind) throw new Error(`Asset kind mismatch for ${asset.id}`);
    if (Number(catalogEntry.bytes) !== Number(asset.bytes)) throw new Error(`Declared byte size mismatch for ${asset.id}`);
    if (catalogEntry.mime !== asset.mime) throw new Error(`Declared MIME mismatch for ${asset.id}`);

    const response = await fetch(assertSameOrigin(catalogEntry.url), {
      cache: "force-cache",
      credentials: "same-origin",
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Unable to load trusted asset ${asset.id}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== asset.bytes) throw new Error(`Fetched byte size mismatch for ${asset.id}`);
    const ref = await sha256Bytes(bytes);
    if (ref !== asset.ref) throw new Error(`SHA-256 mismatch for ${asset.id}`);
    return { bytes, mime: asset.mime };
  }

  async function loadImage(asset) {
    if (asset.kind !== "image") throw new Error(`${asset.id} is not an image asset`);
    if (decoded.has(asset.ref)) return decoded.get(asset.ref);
    if (!inflight.has(asset.ref)) {
      inflight.set(asset.ref, (async () => {
        const verified = await fetchVerified(asset);
        const blob = new Blob([verified.bytes], { type: verified.mime });
        const bitmap = typeof createImageBitmap === "function"
          ? await createImageBitmap(blob)
          : await new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
            image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(`Could not decode ${asset.id}`)); };
            image.src = objectUrl;
          });
        decoded.set(asset.ref, bitmap);
        return bitmap;
      })().finally(() => inflight.delete(asset.ref)));
    }
    return inflight.get(asset.ref);
  }

  async function preload(spec) {
    const imageAssets = (spec.assets || []).filter((asset) => asset.kind === "image");
    await Promise.all(imageAssets.map(loadImage));
    return imageAssets.length;
  }

  function getImage(ref) {
    return decoded.get(ref) || null;
  }

  function dispose() {
    for (const value of decoded.values()) value?.close?.();
    decoded.clear();
    inflight.clear();
  }

  return { preload, loadImage, getImage, dispose };
}

export function estimateDecodedImageBytes(asset) {
  if (asset?.kind !== "image") return 0;
  const width = Math.min(ASSET_POLICY.maxRasterDimension, Number(asset.width || 0));
  const height = Math.min(ASSET_POLICY.maxRasterDimension, Number(asset.height || 0));
  return Math.max(0, width * height * 4);
}
