import { DEMO_ASSET_CATALOG } from "./demo-asset-catalog.js";
import { packageProfile } from "./game-spec.js";
import { validatePublicationPolicy } from "./publication-policy.js";
import { buildTransportPlan } from "./transport.js";
import { createTrustedAssetLoader } from "./trusted-asset-loader.js";
import { mountGameSpec } from "./web-canvas-host.js";

const GAMES = Object.freeze({
  "meteor-dodge": "./examples/meteor-dodge.game.json",
  "tap-bloom": "./examples/tap-bloom.game.json",
  "space-dodge": "./examples/space-dodge.game.json",
});

const canvas = document.querySelector("#sandboxCanvas");
const output = document.querySelector("#sandboxOutput");
const restart = document.querySelector("#restartSandbox");
const gamePicker = document.querySelector("#sandboxGame");
const assetLoader = createTrustedAssetLoader(DEMO_ASSET_CATALOG);
let controller = null;
let loadGeneration = 0;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function load() {
  const generation = ++loadGeneration;
  controller?.destroy?.();
  controller = null;
  output.textContent = "Loading GameSpec…";

  const selected = gamePicker?.value || "meteor-dodge";
  const source = GAMES[selected] || GAMES["meteor-dodge"];
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${source}: HTTP ${response.status}`);
  const spec = await response.json();
  if (generation !== loadGeneration) return;

  const profile = packageProfile(spec);
  const publication = profile.ok ? validatePublicationPolicy(spec) : { ok: false, errors: [] };
  if (!profile.ok || !publication.ok) {
    output.textContent = [...(profile.errors || []), ...(publication.errors || [])].join("\n");
    return;
  }

  const plan = buildTransportPlan(spec);
  const preload = await assetLoader.preload(spec);
  if (generation !== loadGeneration) return;

  const stats = assetLoader.stats();
  const assetNote = preload.uniqueImages
    ? ` · images ${preload.uniqueImages} · decoded ${formatBytes(preload.decodedBytes)}`
    : " · zero-asset";
  output.textContent = `${spec.title} · spec ${formatBytes(plan.canonicalSpecBytes)} · first play ${formatBytes(plan.firstPlayBytes)}${assetNote} · instant ${profile.instantEligible ? "yes" : "no"}`;

  controller = mountGameSpec(canvas, spec, {
    seed: Date.now() >>> 0,
    assetLoader,
    imageSmoothing: false,
    onEffect: (effect) => {
      if (["complete", "fail"].includes(effect.type)) {
        output.textContent = `${effect.type.toUpperCase()} · ${effect.score} · ${effect.detail} · cache ${formatBytes(stats.decodedBytes)}`;
      }
    },
  });
}

function runLoad() {
  load().catch((error) => { output.textContent = error?.stack || String(error); });
}

restart.addEventListener("click", runLoad);
gamePicker?.addEventListener("change", runLoad);
window.addEventListener("pagehide", () => {
  controller?.destroy?.();
  assetLoader.dispose();
}, { once: true });
runLoad();
