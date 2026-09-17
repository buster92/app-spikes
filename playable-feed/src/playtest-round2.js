import { GAME_DEFINITIONS } from "./games.js";

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function int(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function createRuntime(ctx) {
  const cleanups = [];
  const timeouts = new Set();
  const intervals = new Set();
  let raf = null;
  let finished = false;

  const later = (fn, ms) => {
    const handle = setTimeout(() => {
      timeouts.delete(handle);
      if (!finished) fn();
    }, ms);
    timeouts.add(handle);
    return handle;
  };

  const every = (fn, ms) => {
    const handle = setInterval(() => {
      if (!finished) fn();
    }, ms);
    intervals.add(handle);
    return handle;
  };

  const loop = (fn) => {
    const tick = (time) => {
      if (finished) return;
      fn(time);
      if (!finished) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const on = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  const finish = (kind, payload = {}) => {
    if (finished) return;
    finished = true;
    if (kind === "complete") ctx.complete(payload);
    else ctx.fail(payload);
  };

  const destroy = () => {
    finished = true;
    timeouts.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    if (raf !== null) cancelAnimationFrame(raf);
    cleanups.forEach((cleanup) => cleanup());
  };

  return { later, every, loop, on, finish, destroy, isFinished: () => finished };
}

function patchTapRush() {
  const definition = GAME_DEFINITIONS.find((game) => game.id === "tap-rush");
  if (!definition || definition.__round2Tuned) return;

  definition.mount = (host, config, ctx) => {
    const rt = createRuntime(ctx);
    const area = node("div", "game-area tap-rush tap-rush-timed");
    const hud = node("div", "tap-rush-hud");
    const hitLabel = node("span", "tap-rush-count", `0/${config.variant.hits}`);
    const timerLabel = node("span", "tap-rush-time");
    const track = node("div", "tap-rush-track");
    const fill = node("div", "tap-rush-fill");
    const target = node("button", "tap-target", "●");
    target.type = "button";
    target.setAttribute("aria-label", "Tap the target");
    track.append(fill);
    hud.append(hitLabel, timerLabel);
    area.append(hud, track, target);
    host.append(area);

    let hits = 0;
    const required = config.variant.hits;
    const started = performance.now();
    const deadline = started + config.variant.timeMs;

    const moveTarget = () => {
      const margin = 18;
      const width = Math.max(160, area.clientWidth);
      const height = Math.max(260, area.clientHeight);
      const x = margin + Math.random() * Math.max(20, width - 86);
      const y = 54 + Math.random() * Math.max(20, height - 140);
      target.style.left = `${x}px`;
      target.style.top = `${y}px`;
      target.style.transform = `scale(${0.88 + Math.random() * 0.24})`;
    };

    rt.on(target, "pointerdown", (event) => {
      event.preventDefault();
      const remaining = Math.max(0, deadline - performance.now());
      hits += 1;
      hitLabel.textContent = `${hits}/${required}`;
      ctx.interact("target_hit", { hit: hits, required, remaining_ms: Math.round(remaining) });
      ctx.haptic(8);
      ctx.tone(520 + hits * 45, 0.035);
      target.classList.remove("pop");
      void target.offsetWidth;
      target.classList.add("pop");

      if (hits >= required) {
        const elapsed = Math.round(performance.now() - started);
        rt.finish("complete", {
          score: Math.max(220, 1500 - Math.round(elapsed / 5)),
          detail: `${hits}/${required} hits · ${(elapsed / 1000).toFixed(1)}s`,
        });
      } else {
        moveTarget();
      }
    });

    ctx.interact("tap_rush_start", { required, time_ms: config.variant.timeMs });
    requestAnimationFrame(moveTarget);
    rt.loop((time) => {
      const remaining = Math.max(0, deadline - time);
      const ratio = clamp(remaining / config.variant.timeMs, 0, 1);
      timerLabel.textContent = `${(remaining / 1000).toFixed(1)}s`;
      fill.style.transform = `scaleX(${ratio})`;
      if (remaining <= 0) {
        ctx.interact("tap_rush_timeout", { hits, required });
        rt.finish("fail", { score: hits * 90, detail: `${hits}/${required} hits` });
      }
    });

    return rt;
  };

  definition.instruction = "Hit every target before the visible timer runs out";
  definition.__round2Tuned = true;
}

function expressionFor(difficulty) {
  const random = Math.random;
  if (difficulty <= 2) {
    const value = int(random, 5, 70 + difficulty * 25);
    return { text: String(value), value, operation: "number" };
  }

  const useSubtraction = difficulty >= 4 && random() > 0.5;
  if (useSubtraction) {
    const b = int(random, 2, 25 + difficulty * 3);
    const value = int(random, 6, 65 + difficulty * 18);
    const a = value + b;
    return { text: `${a} − ${b}`, value, operation: "subtract" };
  }

  const a = int(random, 2, 45 + difficulty * 8);
  const b = int(random, 2, 35 + difficulty * 7);
  return { text: `${a} + ${b}`, value: a + b, operation: "add" };
}

function patchBiggerWins() {
  const definition = GAME_DEFINITIONS.find((game) => game.id === "bigger-number");
  if (!definition || definition.__round2Tuned) return;

  definition.mount = (host, config, ctx) => {
    const rt = createRuntime(ctx);
    const wrap = node("div", "game-area number-game number-game-expressions");
    const prompt = node("div", "game-prompt", "Pick the bigger result");
    const row = node("div", "choice-row");
    const left = node("button", "number-choice expression-choice");
    const right = node("button", "number-choice expression-choice");
    left.type = right.type = "button";
    row.append(left, right);
    wrap.append(prompt, row);
    host.append(wrap);

    let round = 0;
    let score = 0;
    let options = [];

    const newRound = () => {
      let a = expressionFor(config.difficulty);
      let b = expressionFor(config.difficulty);
      let guard = 0;
      while (a.value === b.value && guard < 20) {
        b = expressionFor(config.difficulty);
        guard += 1;
      }
      options = Math.random() > 0.5 ? [a, b] : [b, a];
      left.textContent = options[0].text;
      right.textContent = options[1].text;
      prompt.textContent = config.difficulty >= 3
        ? `Round ${round + 1}/${config.variant.rounds} · solve fast`
        : `Round ${round + 1}/${config.variant.rounds}`;
    };

    const choose = (index) => {
      const chosen = options[index];
      const other = options[index === 0 ? 1 : 0];
      const correct = chosen.value > other.value;
      ctx.interact("number_choice", {
        round,
        side: index === 0 ? "left" : "right",
        chosen_expression: chosen.text,
        chosen_value: chosen.value,
        other_expression: other.text,
        other_value: other.value,
        correct,
      });
      if (!correct) {
        rt.finish("fail", { score, detail: `${chosen.text} = ${chosen.value}` });
        return;
      }
      ctx.tone(580 + round * 30, 0.04);
      score += 180 + config.difficulty * 25;
      round += 1;
      if (round >= config.variant.rounds) {
        rt.finish("complete", { score, detail: `${round} correct` });
      } else {
        newRound();
      }
    };

    rt.on(left, "click", () => choose(0));
    rt.on(right, "click", () => choose(1));
    ctx.interact("bigger_wins_start", { rounds: config.variant.rounds, arithmetic: config.difficulty >= 3 });
    newRound();
    return rt;
  };

  definition.instruction = "Pick the bigger result. Higher levels mix in + and −";
  definition.__round2Tuned = true;
}

function patchHoldSteady() {
  const definition = GAME_DEFINITIONS.find((game) => game.id === "hold-steady");
  if (!definition || definition.__round2Tuned) return;
  const originalCreateVariant = definition.createVariant;

  definition.createVariant = (args) => {
    const variant = originalCreateVariant(args);
    const difficulty = clamp(Number(args.difficulty || 1), 1, 5);
    return {
      ...variant,
      targetMs: Math.max(1050, Number(variant.targetMs || 1200)),
      moveRadius: [0, 8, 16, 24, 31, 38][difficulty],
      moveSpeed: [0, 0.0010, 0.00125, 0.0015, 0.0018, 0.0021][difficulty],
      tolerance: [0, 60, 58, 55, 52, 49][difficulty],
    };
  };

  definition.mount = (host, config, ctx) => {
    const rt = createRuntime(ctx);
    const wrap = node("div", "game-area hold-game hold-follow-game");
    const hint = node("div", "hold-follow-hint", "Hold the moving center");
    const arena = node("div", "hold-follow-arena");
    const target = node("div", "hold-follow-target");
    const core = node("div", "hold-follow-core", "HOLD");
    const progress = node("div", "hold-follow-progress");
    const progressFill = node("div", "hold-follow-progress-fill");
    progress.append(progressFill);
    target.append(core);
    arena.append(target);
    wrap.append(hint, arena, progress);
    host.append(wrap);

    let holding = false;
    let pointer = null;
    let heldMs = 0;
    let previous = performance.now();
    let pulse = 0;

    const centerAt = (time) => {
      const rect = arena.getBoundingClientRect();
      const cx = rect.width / 2 + Math.sin(time * config.variant.moveSpeed) * config.variant.moveRadius;
      const cy = rect.height / 2 + Math.cos(time * config.variant.moveSpeed * 0.83) * config.variant.moveRadius;
      return { cx, cy, rect };
    };

    const updateTarget = (time) => {
      const { cx, cy } = centerAt(time);
      target.style.left = `${cx}px`;
      target.style.top = `${cy}px`;
    };

    const loseHold = (reason) => {
      if (!holding || rt.isFinished()) return;
      holding = false;
      ctx.interact("hold_lost", { reason, held_ms: Math.round(heldMs) });
      ctx.haptic(24);
      rt.finish("fail", { score: Math.round(heldMs / 4), detail: `${Math.round(heldMs)}ms held` });
    };

    rt.on(arena, "pointerdown", (event) => {
      if (holding) return;
      const { cx, cy, rect } = centerAt(performance.now());
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > config.variant.tolerance) {
        ctx.interact("hold_miss_start", { distance: Math.round(distance) });
        return;
      }
      event.preventDefault();
      arena.setPointerCapture?.(event.pointerId);
      pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
      holding = true;
      previous = performance.now();
      core.textContent = "STAY";
      ctx.interact("hold_start", {
        target_ms: config.variant.targetMs,
        move_radius: config.variant.moveRadius,
        tolerance: config.variant.tolerance,
      });
      ctx.haptic(8);
    });

    rt.on(arena, "pointermove", (event) => {
      if (!holding || pointer?.id !== event.pointerId) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    });
    rt.on(arena, "pointerup", () => loseHold("released"));
    rt.on(arena, "pointercancel", () => loseHold("cancelled"));

    rt.loop((time) => {
      updateTarget(time);
      const dt = Math.min(50, Math.max(0, time - previous));
      previous = time;
      if (!holding || !pointer) return;

      const { cx, cy, rect } = centerAt(time);
      const px = pointer.x - rect.left;
      const py = pointer.y - rect.top;
      const distance = Math.hypot(px - cx, py - cy);
      if (distance > config.variant.tolerance) {
        loseHold("drifted_off_target");
        return;
      }

      heldMs += dt;
      const ratio = clamp(heldMs / config.variant.targetMs, 0, 1);
      progressFill.style.transform = `scaleX(${ratio})`;
      core.textContent = `${Math.round(ratio * 100)}%`;

      const nextPulse = Math.floor(ratio * 4);
      if (nextPulse > pulse && nextPulse < 4) {
        pulse = nextPulse;
        ctx.interact("hold_pulse", { quarter: pulse, held_ms: Math.round(heldMs) });
        ctx.haptic([5, 18, 5]);
        ctx.tone(430 + pulse * 80, 0.025);
      }

      if (ratio >= 1) {
        ctx.interact("hold_complete", { held_ms: Math.round(heldMs), move_radius: config.variant.moveRadius });
        ctx.haptic([8, 24, 8]);
        rt.finish("complete", {
          score: 900 + config.difficulty * 110,
          detail: `${Math.round(heldMs)}ms tracked`,
        });
      }
    });

    requestAnimationFrame(updateTarget);
    return rt;
  };

  definition.instruction = "Hold the moving center until the bar fills. Keep your finger on it";
  definition.__round2Tuned = true;
}

const BUS_COLORS = [
  { id: "coral", hex: "#ff6b7a" },
  { id: "gold", hex: "#ffd166" },
  { id: "mint", hex: "#4dd7a8" },
  { id: "blue", hex: "#5b8cff" },
];

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeBusQueue(colors, capacity, difficulty, random) {
  const queue = colors.flatMap((color) => Array.from({ length: capacity }, () => color));
  const swaps = 1 + difficulty;
  for (let i = 0; i < swaps; i += 1) {
    const a = int(random, 0, Math.max(0, queue.length - 2));
    const b = clamp(a + (random() > 0.5 ? 1 : -1), 0, queue.length - 1);
    [queue[a], queue[b]] = [queue[b], queue[a]];
  }
  return queue;
}

function mountBusJam(host, config, ctx) {
  const rt = createRuntime(ctx);
  const wrap = node("div", "game-area bus-jam-game");
  const busArea = node("div", "bus-current");
  const busIcon = node("div", "bus-icon", "BUS");
  const busSeats = node("div", "bus-seats");
  const queueTitle = node("div", "bus-label", "PASSENGER LINE");
  const queue = node("div", "bus-passenger-queue");
  const waitingTitle = node("div", "bus-label", "WAITING");
  const waiting = node("div", "bus-waiting");
  const status = node("div", "bus-status");
  busArea.append(busIcon, busSeats);
  wrap.append(busArea, queueTitle, queue, waitingTitle, waiting, status);
  host.append(wrap);

  const busColors = config.variant.busColors;
  const passengerQueue = [...config.variant.passengers];
  const waitingPassengers = [];
  let busIndex = 0;
  let boarded = 0;
  let busy = false;

  const currentColor = () => busColors[busIndex];
  const colorMeta = (id) => BUS_COLORS.find((item) => item.id === id) || BUS_COLORS[0];

  const passengerButton = (colorId, source, index) => {
    const button = node("button", `bus-person bus-person-${colorId}`, "●");
    button.type = "button";
    button.style.setProperty("--passenger-color", colorMeta(colorId).hex);
    button.setAttribute("aria-label", `${colorId} passenger`);
    rt.on(button, "click", () => actOnPassenger(source, index));
    return button;
  };

  const render = () => {
    const current = currentColor();
    const meta = colorMeta(current);
    busIcon.style.setProperty("--bus-color", meta.hex);
    busIcon.textContent = busIndex < busColors.length ? `${current.toUpperCase()} BUS` : "DONE";
    busSeats.textContent = busIndex < busColors.length
      ? `${boarded}/${config.variant.capacity} seats`
      : "all buses cleared";

    queue.replaceChildren();
    passengerQueue.slice(0, 7).forEach((color, index) => {
      queue.append(passengerButton(color, "queue", index));
    });

    waiting.replaceChildren();
    for (let i = 0; i < config.variant.waitingSlots; i += 1) {
      if (waitingPassengers[i]) {
        waiting.append(passengerButton(waitingPassengers[i], "waiting", i));
      } else {
        waiting.append(node("div", "bus-wait-slot", "·"));
      }
    }

    status.textContent = `${busIndex + 1}/${busColors.length} buses · ${passengerQueue.length + waitingPassengers.length} passengers left`;
  };

  const advanceBusIfFull = () => {
    if (boarded < config.variant.capacity) return false;
    const completedColor = currentColor();
    ctx.interact("bus_depart", { color: completedColor, bus_index: busIndex });
    ctx.haptic([6, 20, 6]);
    ctx.tone(720, 0.06);
    busArea.classList.add("is-departing");
    busy = true;
    rt.later(() => {
      busArea.classList.remove("is-departing");
      busIndex += 1;
      boarded = 0;
      busy = false;
      if (busIndex >= busColors.length) {
        rt.finish("complete", {
          score: 900 + config.difficulty * 90 + config.variant.waitingSlots * 40,
          detail: `${busColors.length} buses cleared`,
        });
        return;
      }
      render();
    }, 180);
    return true;
  };

  function actOnPassenger(source, index) {
    if (busy || busIndex >= busColors.length) return;
    const color = source === "queue" ? passengerQueue[index] : waitingPassengers[index];
    if (!color) return;
    const target = currentColor();
    const matching = color === target;

    ctx.interact("bus_passenger_tap", {
      source,
      color,
      current_bus: target,
      matching,
      waiting_used: waitingPassengers.length,
      waiting_slots: config.variant.waitingSlots,
    });

    if (matching) {
      if (source === "queue") passengerQueue.splice(index, 1);
      else waitingPassengers.splice(index, 1);
      boarded += 1;
      ctx.haptic(5);
      ctx.tone(520 + boarded * 80, 0.03);
      ctx.interact("bus_board", { color, boarded, capacity: config.variant.capacity, source });
      render();
      advanceBusIfFull();
      return;
    }

    if (source === "waiting") {
      ctx.haptic(18);
      ctx.interact("bus_wrong_waiting_tap", { color, current_bus: target });
      return;
    }

    if (waitingPassengers.length >= config.variant.waitingSlots) {
      ctx.interact("bus_waiting_overflow", { color, current_bus: target, waiting_slots: config.variant.waitingSlots });
      rt.finish("fail", {
        score: busIndex * 220 + boarded * 70,
        detail: "Waiting area filled up",
      });
      return;
    }

    passengerQueue.splice(index, 1);
    waitingPassengers.push(color);
    ctx.interact("bus_wait", { color, waiting_used: waitingPassengers.length });
    ctx.haptic(8);
    render();
  }

  ctx.interact("bus_jam_start", {
    buses: busColors,
    capacity: config.variant.capacity,
    waiting_slots: config.variant.waitingSlots,
    queue: passengerQueue,
  });
  render();
  return rt;
}

function registerBusJam() {
  if (GAME_DEFINITIONS.some((game) => game.id === "bus-jam")) return;
  GAME_DEFINITIONS.push({
    id: "bus-jam",
    title: "Bus Jam",
    category: "puzzle",
    instruction: "Fill the current bus with matching passengers. Park wrong colors in waiting slots",
    createVariant: ({ random, difficulty }) => {
      const count = difficulty >= 4 ? 4 : 3;
      const colors = shuffle(BUS_COLORS.map((item) => item.id), random).slice(0, count);
      const capacity = 2;
      return {
        accent: "#ff8a65",
        accent2: "#5b8cff",
        background: "#12121b",
        difficulty,
        busColors: colors,
        capacity,
        waitingSlots: difficulty >= 4 ? 2 : 3,
        passengers: makeBusQueue(colors, capacity, difficulty, random),
      };
    },
    mount: mountBusJam,
  });
}

patchTapRush();
patchBiggerWins();
patchHoldSteady();
registerBusJam();
