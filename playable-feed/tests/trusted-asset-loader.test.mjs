import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createTrustedAssetLoader } from "../src/sandbox/trusted-asset-loader.js";

function refFor(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fixture(id, byteValues, { width = 8, height = 8 } = {}) {
  const bytes = Uint8Array.from(byteValues);
  const ref = refFor(bytes);
  return {
    bytes,
    ref,
    asset: {
      id,
      kind: "image",
      ref,
      bytes: bytes.byteLength,
      mime: "image/png",
      width,
      height,
    },
    catalog: {
      kind: "image",
      bytes: bytes.byteLength,
      mime: "image/png",
      width,
      height,
      url: `./${id}.bin`,
    },
  };
}

function response(bytes) {
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function fakeDecoder() {
  return async (_blob, asset) => ({
    width: asset.width,
    height: asset.height,
    closed: false,
    close() { this.closed = true; },
  });
}

test("concurrent image loads reserve decoded memory before async fetch completes", async () => {
  const a = fixture("a", [1, 2, 3]);
  const b = fixture("b", [4, 5, 6]);
  let releaseA;
  const waitA = new Promise((resolve) => { releaseA = resolve; });

  const loader = createTrustedAssetLoader({
    [a.ref]: a.catalog,
    [b.ref]: b.catalog,
  }, {
    // Each 8x8 RGBA image accounts for 256 bytes. A 300-byte working set can
    // hold only one even if the first image is still awaiting network/decode.
    maxDecodedBytes: 300,
    decodeImage: fakeDecoder(),
    fetchImpl: async (url) => {
      if (url.endsWith("/a.bin")) {
        await waitA;
        return response(a.bytes);
      }
      return response(b.bytes);
    },
  });

  const first = loader.loadImage(a.asset);
  assert.equal(loader.stats().decodedBytes, 0);
  assert.equal(loader.stats().reservedDecodedBytes, 256);
  assert.equal(loader.stats().totalAccountedDecodedBytes, 256);

  await assert.rejects(loader.loadImage(b.asset), /working set would exceed 300 bytes/);
  assert.equal(loader.stats().reservedDecodedBytes, 256);

  releaseA();
  await first;
  assert.equal(loader.stats().reservedDecodedBytes, 0);
  assert.equal(loader.stats().decodedBytes, 256);
  assert.equal(loader.stats().decodedAssets, 1);
});

test("duplicate concurrent requests share one reservation and one decoded image", async () => {
  const a = fixture("shared", [7, 8, 9]);
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  let fetches = 0;

  const loader = createTrustedAssetLoader({ [a.ref]: a.catalog }, {
    maxDecodedBytes: 512,
    decodeImage: fakeDecoder(),
    fetchImpl: async () => {
      fetches += 1;
      await wait;
      return response(a.bytes);
    },
  });

  const first = loader.loadImage(a.asset);
  const second = loader.loadImage(a.asset);
  assert.equal(loader.stats().reservedDecodedBytes, 256);
  assert.equal(loader.stats().inflight, 1);

  release();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one, two);
  assert.equal(fetches, 1);
  assert.equal(loader.stats().decodedAssets, 1);
  assert.equal(loader.stats().decodedBytes, 256);
});

test("dispose prevents a late async decode from resurrecting creator textures", async () => {
  const a = fixture("late", [10, 11, 12]);
  let release;
  const wait = new Promise((resolve) => { release = resolve; });

  const loader = createTrustedAssetLoader({ [a.ref]: a.catalog }, {
    maxDecodedBytes: 512,
    decodeImage: fakeDecoder(),
    fetchImpl: async () => {
      await wait;
      return response(a.bytes);
    },
  });

  const pending = loader.loadImage(a.asset);
  assert.equal(loader.stats().reservedDecodedBytes, 256);
  loader.dispose();
  assert.equal(loader.stats().disposed, true);
  assert.equal(loader.stats().decodedAssets, 0);

  release();
  await assert.rejects(pending, /Asset load cancelled/);
  assert.equal(loader.stats().decodedAssets, 0);
  assert.equal(loader.stats().decodedBytes, 0);
  assert.equal(loader.stats().reservedDecodedBytes, 0);
  await assert.rejects(loader.loadImage(a.asset), /disposed/);
});
