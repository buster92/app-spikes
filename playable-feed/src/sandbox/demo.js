import { packageProfile } from "./game-spec.js";
import { validatePublicationPolicy } from "./publication-policy.js";
import { mountGameSpec } from "./web-canvas-host.js";

const GAMES = Object.freeze({
  "meteor-dodge": "./examples/meteor-dodge.game.json",
  "tap-bloom": "./examples/tap-bloom.game.json",
});

const canvas = document.querySelector("#sandboxCanvas");
const output = document.querySelector("#sandboxOutput");
const restart = document.querySelector("#restartSandbox");
const gamePicker = document.querySelector("#sandboxGame");
let controller = null;

async function load() {
  controller?.destroy?.();
  output.textContent = "Loading GameSpec…";

  const selected = gamePicker?.value || "meteor-dodge";
  const source = GAMES[selected] || GAMES["meteor-dodge"];
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${source}: HTTP ${response.status}`);
  const spec = await response.json();
  const profile = packageProfile(spec);
  const publication = profile.ok ? validatePublicationPolicy(spec) : { ok: false, errors: [] };

  if (!profile.ok || !publication.ok) {
    output.textContent = [...(profile.errors || []), ...(publication.errors || [])].join("\n");
    return;
  }

  output.textContent = `${spec.title} · GameSpec ${profile.metrics.specBytes} B · assets ${profile.metrics.declaredAssetBytes} B · instant ${profile.instantEligible ? "yes" : "no"}`;
  controller = mountGameSpec(canvas, spec, {
    seed: Date.now() >>> 0,
    onEffect: (effect) => {
      if (["complete", "fail"].includes(effect.type)) {
        output.textContent = `${effect.type.toUpperCase()} · ${effect.score} · ${effect.detail}`;
      }
    },
  });
}

restart.addEventListener("click", () => load().catch((error) => { output.textContent = error?.stack || String(error); }));
gamePicker?.addEventListener("change", () => load().catch((error) => { output.textContent = error?.stack || String(error); }));
load().catch((error) => { output.textContent = error?.stack || String(error); });
