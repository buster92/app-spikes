import { createAssetResidencyController } from "./asset-residency.js";
import { DEMO_ASSET_CATALOG } from "./demo-asset-catalog.js";
import { packageProfileV1, validatePublicationPolicyV1 } from "./game-spec-v1.js";
import { reviewGameSpecV1 } from "./review-v1.js";
import { SafeSandboxRuntimeV1 } from "./runtime-v1.js";
import { createTrustedAssetLoader } from "./trusted-asset-loader.js";
import { mountGameSpec } from "./web-canvas-host.js";

const source = "./examples/pocket-shooter-v1.game.json";
const canvas = document.querySelector("#v1Canvas");
const output = document.querySelector("#v1Output");
const restart = document.querySelector("#restartV1");
const assetLoader = createTrustedAssetLoader(DEMO_ASSET_CATALOG);
const residency = createAssetResidencyController(assetLoader, { maxPrefetchGames: 0 });
let controller = null;
let generation = 0;

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function show(text) {
  output.textContent = text;
}

async function load() {
  const token = ++generation;
  residency.cancelPending();
  controller?.destroy?.();
  controller = null;
  show("Loading v1 GameSpec…");

  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load Pocket Shooter: HTTP ${response.status}`);
  const spec = await response.json();
  if (token !== generation) return;

  const profile = packageProfileV1(spec);
  const publication = profile.ok ? validatePublicationPolicyV1(spec) : { ok: false, errors: [] };
  if (!profile.ok || !publication.ok) {
    show([...profile.errors, ...(publication.errors || [])].join("\n"));
    return;
  }

  const review = reviewGameSpecV1(spec, { seeds: [1, 7, 42], maxSimulatedMs: 3000 });
  if (!review.ok) {
    show(`Automated review rejected draft:\n${review.errors.join("\n")}`);
    return;
  }

  const resident = await residency.activate(spec);
  if (token !== generation || resident.stale) return;

  const firstPlay = profile.metrics.specBytes + profile.metrics.declaredAssetBytes;
  show(
    `Pocket Shooter · v1 draft · spec ${formatBytes(profile.metrics.specBytes)} · cold first play ${formatBytes(firstPlay)} · automated probes ${review.summary.crashes} crashes / ${review.summary.seeds} seeds`,
  );

  controller = mountGameSpec(canvas, spec, {
    RuntimeClass: SafeSandboxRuntimeV1,
    seed: 42,
    assetLoader,
    imageSmoothing: false,
    onEffect: (effect) => {
      if (["complete", "fail"].includes(effect.type)) {
        const health = controller?.runtime?.entities.get("player")?.state?.health;
        show(`${effect.type.toUpperCase()} · score ${effect.score} · health ${health ?? "—"} · ${effect.detail}`);
      }
    },
  });
}

function runLoad() {
  load().catch((error) => show(error?.stack || String(error)));
}

restart.addEventListener("click", runLoad);
window.addEventListener("pagehide", () => {
  generation += 1;
  controller?.destroy?.();
  residency.releaseAll();
  assetLoader.dispose();
}, { once: true });
runLoad();
