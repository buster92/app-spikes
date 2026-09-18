import { HARD_LIMITS } from "./game-spec.js";
import { SafeSandboxRuntime } from "./safe-runtime.js";

function hasContinuousSimulation(runtime, spec) {
  if ((spec.rules || []).some((rule) => rule.on === "tick")) return true;
  for (const entity of runtime.entities.values()) {
    if (Number(entity.vx || 0) !== 0 || Number(entity.vy || 0) !== 0) return true;
  }
  return false;
}

function nextTimerDelay(runtime) {
  let next = Infinity;
  for (const state of runtime.timerState.values()) {
    if (state.fired && !state.everyMs) continue;
    next = Math.min(next, state.nextAt - runtime.elapsedMs);
  }
  if (!Number.isFinite(next)) return null;
  return Math.max(0, next);
}

function referencedSpriteAssetIds(spec) {
  const ids = new Set();
  for (const entity of spec.entities || []) {
    if (entity?.kind === "sprite") ids.add(entity.asset);
  }
  for (const template of Object.values(spec.templates || {})) {
    if (template?.kind === "sprite") ids.add(template.asset);
  }
  return ids;
}

function assertSpriteAssetsReady(spec, assetLoader, assetsById) {
  const refs = referencedSpriteAssetIds(spec);
  if (!refs.size) return;
  if (!assetLoader) throw new Error("GameSpec uses sprites but no trusted asset loader was provided");
  for (const id of refs) {
    const asset = assetsById.get(id);
    if (!asset) throw new Error(`Sprite references unknown asset ${id}`);
    if (asset.kind !== "image") throw new Error(`Sprite asset ${id} is not an image`);
    if (!assetLoader.getImage(asset.ref)) throw new Error(`Sprite asset ${id} has not been verified and preloaded`);
  }
}

function hasSourceRect(entity) {
  return ["sourceX", "sourceY", "sourceWidth", "sourceHeight"].every((key) => Number.isFinite(entity?.[key]));
}

export function resolveRuntimeSeed(seed) {
  return seed ?? 1;
}

export function mountGameSpec(canvas, spec, options = {}) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D rendering is unavailable");
  canvas.width = spec.canvas.width;
  canvas.height = spec.canvas.height;

  const assetLoader = options.assetLoader || null;
  const assetsById = new Map((spec.assets || []).map((asset) => [asset.id, asset]));
  assertSpriteAssetsReady(spec, assetLoader, assetsById);

  let frame = 0;
  let timer = 0;
  let destroyed = false;
  let suspended = false;
  let finishedNotified = false;
  let last = performance.now();

  const effects = [];
  const RuntimeClass = options.RuntimeClass || SafeSandboxRuntime;
  const runtime = new RuntimeClass(spec, {
    seed: resolveRuntimeSeed(options.seed),
    onEvent: options.onEvent || (() => {}),
    onEffect: (effect) => {
      effects.push(effect);
      if (effect.type === "haptic") navigator.vibrate?.(effect.pattern);
      options.onEffect?.(effect);
    },
  });

  const cancelScheduled = () => {
    if (frame) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    frame = 0;
    timer = 0;
  };

  const drawSprite = (entity) => {
    const asset = assetsById.get(entity.asset);
    const bitmap = asset ? assetLoader?.getImage(asset.ref) : null;
    if (!bitmap) {
      context.fillStyle = "#ff3b81";
      context.fillRect(-entity.width / 2, -entity.height / 2, entity.width, entity.height);
      return;
    }
    context.imageSmoothingEnabled = options.imageSmoothing !== false;
    if (hasSourceRect(entity)) {
      context.drawImage(
        bitmap,
        entity.sourceX,
        entity.sourceY,
        entity.sourceWidth,
        entity.sourceHeight,
        -entity.width / 2,
        -entity.height / 2,
        entity.width,
        entity.height,
      );
      return;
    }
    context.drawImage(bitmap, -entity.width / 2, -entity.height / 2, entity.width, entity.height);
  };

  const render = () => {
    context.fillStyle = spec.canvas.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const entity of runtime.entities.values()) {
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, entity.opacity));
      context.translate(entity.x, entity.y);
      context.rotate((entity.rotation * Math.PI) / 180);
      context.fillStyle = entity.color;
      if (entity.kind === "circle") {
        context.beginPath();
        context.arc(0, 0, entity.radius, 0, Math.PI * 2);
        context.fill();
      } else if (entity.kind === "rect") {
        context.fillRect(-entity.width / 2, -entity.height / 2, entity.width, entity.height);
      } else if (entity.kind === "text") {
        context.font = `${Math.max(12, entity.height || 18)}px system-ui`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(entity.text, 0, 0);
      } else if (entity.kind === "sprite") {
        drawSprite(entity);
      }
      context.restore();
    }

    context.fillStyle = "rgba(255,255,255,.92)";
    context.font = "700 16px system-ui";
    context.textAlign = "left";
    context.fillText(`Score ${runtime.variables.score ?? 0}`, 14, 24);
    context.textAlign = "right";
    context.fillText(`${(runtime.elapsedMs / 1000).toFixed(1)}s`, canvas.width - 14, 24);
  };

  const notifyFinish = () => {
    if (finishedNotified || ["running", "idle"].includes(runtime.status)) return;
    finishedNotified = true;
    cancelScheduled();
    options.onFinish?.(runtime.snapshot());
  };

  const runRuntime = (operation) => {
    try {
      operation();
      return true;
    } catch (error) {
      if (["running", "idle"].includes(runtime.status)) throw error;
      options.onRuntimeError?.(error, runtime.snapshot());
      notifyFinish();
      return false;
    }
  };

  const advanceClock = (now) => {
    if (destroyed || suspended || runtime.status !== "running") {
      last = now;
      return;
    }
    let remaining = Math.max(0, now - last);
    last = now;
    while (remaining > 0 && runtime.status === "running") {
      const chunk = Math.min(HARD_LIMITS.maxStepMs, remaining);
      if (!runRuntime(() => runtime.step(chunk))) return;
      remaining -= chunk;
    }
  };

  const schedule = () => {
    cancelScheduled();
    if (destroyed || suspended) return;
    if (runtime.status !== "running") {
      notifyFinish();
      return;
    }

    if (hasContinuousSimulation(runtime, spec)) {
      frame = requestAnimationFrame((now) => {
        advanceClock(now);
        render();
        schedule();
      });
      return;
    }

    const delay = nextTimerDelay(runtime);
    if (delay === null) return;
    timer = setTimeout(() => {
      advanceClock(performance.now());
      render();
      schedule();
    }, Math.max(1, delay));
  };

  const toGamePoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const pointer = (type) => (event) => {
    if (destroyed || suspended || runtime.status !== "running") return;
    advanceClock(performance.now());
    if (runtime.status !== "running") {
      render();
      return;
    }

    const point = toGamePoint(event);
    if (!runRuntime(() => runtime.pointer(type, point.x, point.y))) {
      render();
      return;
    }
    if (type === "pointerUp" && runtime.status === "running") {
      if (!runRuntime(() => runtime.pointer("tap", point.x, point.y))) {
        render();
        return;
      }
    }
    if (runtime.status === "running" && !runRuntime(() => runtime.step(0))) {
      render();
      return;
    }
    render();
    schedule();
  };

  const handlers = {
    pointerdown: pointer("pointerDown"),
    pointermove: pointer("pointerMove"),
    pointerup: pointer("pointerUp"),
  };
  for (const [name, handler] of Object.entries(handlers)) canvas.addEventListener(name, handler);

  const suspend = () => {
    if (destroyed || suspended) return;
    suspended = true;
    cancelScheduled();
  };

  const resume = () => {
    if (destroyed || !suspended) return;
    suspended = false;
    last = performance.now();
    render();
    schedule();
  };

  const visibilityHandler = () => {
    if (document.hidden) suspend();
    else resume();
  };
  document.addEventListener("visibilitychange", visibilityHandler);

  const detachHostListeners = () => {
    document.removeEventListener("visibilitychange", visibilityHandler);
    for (const [name, handler] of Object.entries(handlers)) canvas.removeEventListener(name, handler);
  };

  try {
    runRuntime(() => runtime.start());
    if (runtime.status === "running") runRuntime(() => runtime.step(0));
    render();
    schedule();
  } catch (error) {
    destroyed = true;
    cancelScheduled();
    detachHostListeners();
    throw error;
  }

  return {
    runtime,
    effects,
    suspend,
    resume,
    render,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelScheduled();
      detachHostListeners();
    },
  };
}
