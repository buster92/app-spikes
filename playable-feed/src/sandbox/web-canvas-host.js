import { SandboxRuntime } from "./runtime-core.js";

export function mountGameSpec(canvas, spec, options = {}) {
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = spec.canvas.width;
  canvas.height = spec.canvas.height;
  let frame = 0;
  let last = performance.now();

  const effects = [];
  const runtime = new SandboxRuntime(spec, {
    seed: options.seed || 1,
    onEvent: options.onEvent || (() => {}),
    onEffect: (effect) => {
      effects.push(effect);
      if (effect.type === "haptic") navigator.vibrate?.(effect.pattern);
      options.onEffect?.(effect);
    },
  });

  const toGamePoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const pointer = (type) => (event) => {
    const point = toGamePoint(event);
    runtime.pointer(type, point.x, point.y);
    if (type === "pointerUp") runtime.pointer("tap", point.x, point.y);
  };
  const handlers = {
    pointerdown: pointer("pointerDown"),
    pointermove: pointer("pointerMove"),
    pointerup: pointer("pointerUp"),
  };
  for (const [name, handler] of Object.entries(handlers)) canvas.addEventListener(name, handler);

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
      }
      context.restore();
    }

    context.fillStyle = "rgba(255,255,255,.92)";
    context.font = "700 16px system-ui";
    context.textAlign = "left";
    context.fillText(`Score ${runtime.variables.score ?? 0}`, 14, 24);
    context.textAlign = "right";
    context.fillText(`${Math.max(0, Math.ceil((12_000 - runtime.elapsedMs) / 1000))}s`, canvas.width - 14, 24);
  };

  const loop = (now) => {
    const delta = now - last;
    last = now;
    if (runtime.status === "running") runtime.step(delta);
    render();
    if (["running", "idle"].includes(runtime.status)) frame = requestAnimationFrame(loop);
    else options.onFinish?.(runtime.snapshot());
  };

  runtime.start();
  frame = requestAnimationFrame(loop);

  return {
    runtime,
    effects,
    destroy() {
      cancelAnimationFrame(frame);
      for (const [name, handler] of Object.entries(handlers)) canvas.removeEventListener(name, handler);
    },
  };
}
