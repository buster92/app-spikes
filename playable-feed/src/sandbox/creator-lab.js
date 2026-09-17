import { createAssetResidencyController } from "./asset-residency.js";
import { validateForAuthoring, simulateForAuthoring } from "./creator-tools.js";
import { DEMO_ASSET_CATALOG } from "./demo-asset-catalog.js";
import { createTrustedAssetLoader } from "./trusted-asset-loader.js";
import { mountGameSpec } from "./web-canvas-host.js";

const EXAMPLES = Object.freeze({
  "meteor-dodge": "./examples/meteor-dodge.game.json",
  "tap-bloom": "./examples/tap-bloom.game.json",
  "space-dodge": "./examples/space-dodge.game.json",
  "creator-star-catch": "./examples/creator-star-catch.game.json",
  "whack-orb": "./examples/whack-orb.game.json",
});

const editor = document.querySelector("#specEditor");
const output = document.querySelector("#creatorOutput");
const picker = document.querySelector("#examplePicker");
const canvas = document.querySelector("#creatorCanvas");
const loadButton = document.querySelector("#loadExample");
const validateButton = document.querySelector("#validateSpec");
const simulateButton = document.querySelector("#simulateSpec");
const runButton = document.querySelector("#runSpec");

const assetLoader = createTrustedAssetLoader(DEMO_ASSET_CATALOG);
const residency = createAssetResidencyController(assetLoader, { maxPrefetchGames: 0 });
let controller = null;
let generation = 0;

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function parseEditor() {
  try {
    return { ok: true, spec: JSON.parse(editor.value) };
  } catch (error) {
    return {
      ok: false,
      error: {
        severity: "error",
        stage: "json_parse",
        code: "INVALID_JSON",
        path: null,
        message: error?.message || String(error),
      },
    };
  }
}

function compactValidation(result) {
  return {
    ok: result.ok,
    runtime: result.runtime,
    diagnostics: result.diagnostics,
    warnings: result.warnings,
    transport: result.transport ? {
      feedDescriptorBytes: result.transport.feedDescriptorBytes,
      specBytes: result.transport.canonicalSpecBytes,
      declaredAssetBytes: result.transport.declaredAssetBytes,
      firstPlayBytes: result.transport.firstPlayBytes,
      instantEligible: result.transport.instantEligible,
    } : null,
  };
}

function show(value) {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function loadExample() {
  const token = ++generation;
  const id = picker.value || "meteor-dodge";
  const url = EXAMPLES[id] || EXAMPLES["meteor-dodge"];
  show(`Loading ${id}…`);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${id}: HTTP ${response.status}`);
  const spec = await response.json();
  if (token !== generation) return;
  editor.value = JSON.stringify(spec, null, 2);
  const validation = validateForAuthoring(spec);
  show({ loaded: id, validation: compactValidation(validation) });
}

function validateCurrent() {
  const parsed = parseEditor();
  if (!parsed.ok) {
    show({ ok: false, diagnostics: [parsed.error] });
    return null;
  }
  const result = validateForAuthoring(parsed.spec);
  show(compactValidation(result));
  return result.ok ? parsed.spec : null;
}

function simulateCurrent() {
  const parsed = parseEditor();
  if (!parsed.ok) {
    show({ ok: false, diagnostics: [parsed.error] });
    return;
  }
  const result = simulateForAuthoring(parsed.spec, {
    seeds: [1, 7, 42],
    maxSimulatedMs: 6000,
  });
  show({
    ok: result.ok,
    verdict: result.verdict,
    stage: result.stage,
    diagnostics: result.diagnostics,
    warnings: result.warnings,
    summary: result.summary,
    runs: result.runs?.map((run) => ({
      seed: run.seed,
      crashed: run.crashed,
      status: run.status,
      elapsedMs: run.elapsedMs,
      result: run.result,
      peakEntities: run.peakEntities,
      peakOps: run.peakOps,
    })),
  });
}

async function runCurrent() {
  const parsed = parseEditor();
  if (!parsed.ok) {
    show({ ok: false, diagnostics: [parsed.error] });
    return;
  }

  const validation = validateForAuthoring(parsed.spec);
  if (!validation.ok) {
    show(compactValidation(validation));
    return;
  }

  const token = ++generation;
  controller?.destroy?.();
  controller = null;
  show("Resolving reviewed assets…");

  try {
    const resident = await residency.activate(parsed.spec);
    if (token !== generation || resident.stale) return;

    controller = mountGameSpec(canvas, parsed.spec, {
      seed: 42,
      assetLoader,
      imageSmoothing: false,
      onEffect: (effect) => {
        if (["complete", "fail"].includes(effect.type)) {
          show({
            runtime: effect.type,
            score: effect.score,
            detail: effect.detail,
            elapsedMs: effect.elapsedMs,
            assets: assetLoader.stats(),
          });
        }
      },
    });

    show({
      running: parsed.spec.id,
      seed: 42,
      specBytes: formatBytes(validation.transport.canonicalSpecBytes),
      firstPlayBytes: formatBytes(validation.transport.firstPlayBytes),
      assets: assetLoader.stats(),
    });
  } catch (error) {
    show({
      ok: false,
      stage: "preview_runtime",
      message: error?.message || String(error),
      note: "A valid GameSpec can still require reviewed assets that are not present in this local host catalog.",
    });
  }
}

loadButton.addEventListener("click", () => loadExample().catch((error) => show(error?.stack || String(error))));
validateButton.addEventListener("click", validateCurrent);
simulateButton.addEventListener("click", simulateCurrent);
runButton.addEventListener("click", () => runCurrent().catch((error) => show(error?.stack || String(error))));

window.addEventListener("pagehide", () => {
  generation += 1;
  controller?.destroy?.();
  residency.releaseAll();
  assetLoader.dispose();
}, { once: true });

loadExample().catch((error) => show(error?.stack || String(error)));
