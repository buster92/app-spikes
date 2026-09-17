import { ASSET_POLICY, decodedImageBytes, isTrustedAssetRef } from "./asset-contract.js";

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
    throw new Error("Trusted asset catalog may only resolve same-origin URLs");
  }
  return resolved.toString();
}

function collectReferencedImageIds(spec) {
  const ids = new Set();
  for (const entity of spec.entities || []) {
    if (entity?.kind === "sprite" && typeof entity.asset === "string") ids.add(entity.asset);
  }
  for (const template of Object.values(spec.templates || {})) {
    if (template?.kind === "sprite" && typeof template.asset === "string") ids.add(template.asset);
  }
  return ids;
}

function assertCatalogMetadata(asset, catalogEntry) {
  if (!catalogEntry) throw new Error(`Asset ${asset.ref} is not present in the host-controlled catalog`);
  if (catalogEntry.kind !== asset.kind) throw new Error(`Asset kind mismatch for ${asset.id}`);
  if (Number(catalogEntry.bytes) !== Number(asset.bytes)) throw new Error(`Declared byte size mismatch for ${asset.id}`);
  if (catalogEntry.mime !== asset.mime) throw new Error(`Declared MIME mismatch for ${asset.id}`);
  if (asset.kind === "image") {
    if (Number(catalogEntry.width) !== Number(asset.width) || Number(catalogEntry.height) !== Number(asset.height)) {
      throw new Error(`Declared dimensions mismatch trusted catalog for ${asset.id}`);
    }
  }
}

async function decodeRaster(blob, asset) {
  const decoded = typeof createImageBitmap === "function"
    ? await createImageBitmap(blob)
    : await new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(`Could not decode ${asset.id}`)); };
      image.src = objectUrl;
    });

  const width = Number(decoded.width || decoded.naturalWidth || 0);
  const height = Number(decoded.height || decoded.naturalHeight || 0);
  if (width !== asset.width || height !== asset.height) {
    decoded?.close?.();
    throw new Error(`Decoded dimensions mismatch for ${asset.id}: got ${width}x${height}, expected ${asset.width}x${asset.height}`);
  }
  return decoded;
}

export function createTrustedAssetLoader(catalog = {}, options = {}) {
  const entries = new Map(Object.entries(catalog));
  const inflight = new Map();
  const decoded = new Map();
  const decodedBytesByRef = new Map();
  const reservedBytesByRef = new Map();
  const maxDecodedBytes = Number(options.maxDecodedBytes || ASSET_POLICY.maxTotalDecodedImageBytes);
  let decodedBytes = 0;
  let reservedDecodedBytes = 0;
  let disposed = false;
  let lifetime = 0;

  async function fetchVerified(asset) {
    if (!asset || !isTrustedAssetRef(asset.ref)) throw new Error("Invalid content-addressed asset reference");
    const catalogEntry = entries.get(asset.ref);
    assertCatalogMetadata(asset, catalogEntry);

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
    if (disposed) throw new Error("Trusted asset loader has been disposed");
    if (asset.kind !== "image") throw new Error(`${asset.id} is not an image asset`);
    if (decoded.has(asset.ref)) return decoded.get(asset.ref);
    if (!inflight.has(asset.ref)) {
      const expectedDecodedBytes = decodedImageBytes(asset);
      if (expectedDecodedBytes <= 0 || expectedDecodedBytes > ASSET_POLICY.maxSingleDecodedImageBytes) {
        throw new Error(`Decoded image budget invalid for ${asset.id}`);
      }
      if (decodedBytes + reservedDecodedBytes + expectedDecodedBytes > maxDecodedBytes) {
        throw new Error(`Decoded image working set would exceed ${maxDecodedBytes} bytes`);
      }

      // Reserve the decoded footprint before any async fetch/decode work starts.
      // Without this, concurrent image loads can each observe the same free
      // memory and collectively exceed the active decoded-image budget.
      reservedBytesByRef.set(asset.ref, expectedDecodedBytes);
      reservedDecodedBytes += expectedDecodedBytes;
      const loadLifetime = lifetime;

      const promise = (async () => {
        const verified = await fetchVerified(asset);
        const bitmap = await decodeRaster(new Blob([verified.bytes], { type: verified.mime }), asset);

        // The browser may finish a fetch/decode after pagehide/disposal. Never
        // let that asynchronous completion recreate decoded resources.
        if (disposed || loadLifetime !== lifetime) {
          bitmap?.close?.();
          throw new Error(`Asset load cancelled for ${asset.id}`);
        }

        if (decoded.has(asset.ref)) {
          bitmap?.close?.();
          return decoded.get(asset.ref);
        }
        decoded.set(asset.ref, bitmap);
        decodedBytesByRef.set(asset.ref, expectedDecodedBytes);
        decodedBytes += expectedDecodedBytes;
        return bitmap;
      })().finally(() => {
        const reserved = reservedBytesByRef.get(asset.ref) || 0;
        reservedDecodedBytes = Math.max(0, reservedDecodedBytes - reserved);
        reservedBytesByRef.delete(asset.ref);
        inflight.delete(asset.ref);
      });
      inflight.set(asset.ref, promise);
    }
    return inflight.get(asset.ref);
  }

  async function preload(spec) {
    if (disposed) throw new Error("Trusted asset loader has been disposed");
    const byId = new Map((spec.assets || []).map((asset) => [asset.id, asset]));
    const referenced = collectReferencedImageIds(spec);
    const uniqueByRef = new Map();
    for (const id of referenced) {
      const asset = byId.get(id);
      if (asset?.kind === "image" && !uniqueByRef.has(asset.ref)) uniqueByRef.set(asset.ref, asset);
    }
    const imageAssets = [...uniqueByRef.values()];
    const projected = imageAssets.reduce((sum, asset) => sum + decodedImageBytes(asset), 0);
    if (projected > maxDecodedBytes) throw new Error(`Game image working set ${projected} exceeds ${maxDecodedBytes} bytes`);
    await Promise.all(imageAssets.map(loadImage));
    return {
      referencedImages: referenced.size,
      uniqueImages: imageAssets.length,
      decodedBytes: projected,
    };
  }

  function getImage(ref) {
    return decoded.get(ref) || null;
  }

  function releaseExcept(refs = []) {
    const keep = new Set(refs);
    for (const [ref, value] of decoded.entries()) {
      if (keep.has(ref)) continue;
      value?.close?.();
      decoded.delete(ref);
      decodedBytes -= decodedBytesByRef.get(ref) || 0;
      decodedBytesByRef.delete(ref);
    }
    decodedBytes = Math.max(0, decodedBytes);
  }

  function stats() {
    return {
      decodedAssets: decoded.size,
      decodedBytes,
      reservedDecodedBytes,
      totalAccountedDecodedBytes: decodedBytes + reservedDecodedBytes,
      maxDecodedBytes,
      inflight: inflight.size,
      disposed,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime += 1;
    releaseExcept([]);
    // In-flight promises cannot always be cancelled at the browser API level,
    // but the lifetime guard above guarantees their decoded output is closed.
  }

  return { preload, loadImage, getImage, releaseExcept, stats, dispose };
}

export function estimateDecodedImageBytes(asset) {
  return decodedImageBytes(asset);
}
