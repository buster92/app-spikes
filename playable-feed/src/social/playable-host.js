import { buildPublicationEnvelope } from "../sandbox/transport.js";
import { SafeSandboxRuntimeV1 } from "../sandbox/runtime-v1.js";
import { SafeSandboxRuntimeV2 } from "../sandbox/runtime-v2.js";
import { SafeSandboxRuntimeV3 } from "../sandbox/runtime-v3.js";
import { mountGameSpec } from "../sandbox/web-canvas-host.js";
import { bundledPlayable } from "./catalog.js";
import { samePlayableRef, SocialDomainError } from "./domain.js";

function runtimeClassFor(runtime) {
  if (runtime === "playloop-2d-v1") return SafeSandboxRuntimeV1;
  if (runtime === "playloop-2d-v2") return SafeSandboxRuntimeV2;
  if (runtime === "playloop-2d-v3") return SafeSandboxRuntimeV3;
  if (runtime === "playloop-2d-v0") return undefined;
  throw new SocialDomainError("unsupported_runtime", `Unsupported runtime ${runtime}`);
}

export function normalizeRuntimeResult(policy, snapshot) {
  const completed = snapshot?.status === "complete";
  const value = policy.kind.includes("time") ? snapshot?.result?.elapsedMs
    : policy.kind.includes("moves") ? snapshot?.variables?.moves
      : snapshot?.result?.score;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  const metric = completed && numeric !== null ? Math.max(0, Math.round(numeric)) : null;
  return { status: completed ? "completed" : "failed", metric };
}

export class PlayableHost {
  constructor({ fetchImpl = globalThis.fetch, mountImpl = mountGameSpec } = {}) {
    this.fetchImpl = fetchImpl;
    this.mountImpl = mountImpl;
    this.controller = null;
    this.generation = 0;
  }

  async mount(canvas, playableRef, policy, { onFinish, onError } = {}) {
    this.destroy();
    const generation = ++this.generation;
    const catalog = bundledPlayable(playableRef.gameId);
    if (!catalog || !samePlayableRef(playableRef, { ...playableRef, ...catalog, gameId: catalog.id, seed: playableRef.seed })) {
      throw new SocialDomainError("unavailable_playable", "This playable revision is not available on this device");
    }
    const response = await this.fetchImpl(catalog.path, { cache: "no-store" });
    if (!response.ok) throw new SocialDomainError("unavailable_playable", `Playable could not load (HTTP ${response.status})`);
    const spec = await response.json();
    const envelope = await buildPublicationEnvelope(spec);
    const resolved = { runtime: envelope.feedDescriptor.runtime, gameId: envelope.feedDescriptor.gameId, manifestVersion: envelope.feedDescriptor.manifestVersion, manifestRef: envelope.feedDescriptor.manifestRef, specRef: envelope.feedDescriptor.specRef, seed: playableRef.seed };
    if (!samePlayableRef(resolved, playableRef)) throw new SocialDomainError("playable_mismatch", "Bundled playable does not match the post's immutable reference");
    if (generation !== this.generation) return null;
    const controller = this.mountImpl(canvas, spec, {
      RuntimeClass: runtimeClassFor(spec.runtime), seed: playableRef.seed, imageSmoothing: false,
      onRuntimeError: (error) => onError?.(error),
      onFinish: (snapshot) => onFinish?.(normalizeRuntimeResult(policy, snapshot), snapshot),
    });
    if (generation !== this.generation) {
      controller?.destroy?.();
      return null;
    }
    this.controller = controller;
    return this.controller;
  }

  destroy() {
    this.generation += 1;
    this.controller?.destroy?.();
    this.controller = null;
  }
}
