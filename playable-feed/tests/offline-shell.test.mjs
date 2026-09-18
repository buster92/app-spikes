import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function staticRelativeImports(source) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) imports.push(match[1]);
  }
  return imports;
}

function normalizedAssetPath(modulePath, dependency) {
  const absolute = path.resolve(ROOT, path.dirname(modulePath), dependency);
  const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
  return `./${relative}`;
}

test("offline shell precaches transitive local module dependencies", () => {
  const serviceWorker = readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const assetMatch = serviceWorker.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(assetMatch, "service worker must declare a static ASSETS list");

  const assets = new Set(
    [...assetMatch[1].matchAll(/["'](\.\/[^"']+)["']/g)].map((match) => match[1]),
  );
  const queue = [...assets].filter((asset) => asset.endsWith(".js"));
  const visited = new Set();

  while (queue.length) {
    const asset = queue.shift();
    if (visited.has(asset)) continue;
    visited.add(asset);

    const modulePath = asset.slice(2);
    const source = readFileSync(path.join(ROOT, modulePath), "utf8");
    for (const dependency of staticRelativeImports(source)) {
      const dependencyAsset = normalizedAssetPath(modulePath, dependency);
      assert.ok(
        assets.has(dependencyAsset),
        `${asset} imports ${dependency}, but ${dependencyAsset} is not precached for offline startup`,
      );
      if (dependencyAsset.endsWith(".js") && !visited.has(dependencyAsset)) {
        queue.push(dependencyAsset);
      }
    }
  }
});
