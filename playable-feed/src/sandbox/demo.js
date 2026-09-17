import { packageProfile } from "./game-spec.js";
import { mountGameSpec } from "./web-canvas-host.js";

const canvas = document.querySelector("#sandboxCanvas");
const output = document.querySelector("#sandboxOutput");
const restart = document.querySelector("#restartSandbox");
let controller = null;

async function load() {
  controller?.destroy?.();
  output.textContent = "Loading GameSpec…";
  const response = await fetch("./examples/meteor-dodge.game.json", { cache: "no-store" });
  const spec = await response.json();
  const profile = packageProfile(spec);
  if (!profile.ok) {
    output.textContent = profile.errors.join("\n");
    return;
  }
  output.textContent = `GameSpec ${profile.metrics.specBytes} B · assets ${profile.metrics.declaredAssetBytes} B · instant ${profile.instantEligible ? "yes" : "no"}`;
  controller = mountGameSpec(canvas, spec, {
    seed: Date.now() >>> 0,
    onEffect: (effect) => {
      if (["complete", "fail"].includes(effect.type)) output.textContent = `${effect.type.toUpperCase()} · ${effect.score} · ${effect.detail}`;
    },
  });
}

restart.addEventListener("click", load);
load().catch((error) => { output.textContent = error?.stack || String(error); });
