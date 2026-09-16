const PALETTES = [
  ["#7c5cff", "#16d9e3", "#0f1021"],
  ["#ff5c8a", "#ffb347", "#1c1020"],
  ["#3ddc97", "#5b8cff", "#071a1a"],
  ["#f4d35e", "#ee6c4d", "#17130b"],
  ["#9b5de5", "#00bbf9", "#10101d"],
  ["#00f5d4", "#f15bb5", "#071719"],
];

const SYMBOLS = ["◆", "●", "▲", "■", "✦", "⬟"];
const DIRECTIONS = ["LEFT", "RIGHT", "DOWN"];

function choice(items, random) {
  return items[Math.floor(random() * items.length)];
}

function int(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function palette(random) {
  return choice(PALETTES, random);
}

function baseVariant(random, difficulty) {
  const [accent, accent2, background] = palette(random);
  return {
    accent,
    accent2,
    background,
    difficulty,
    roundSeconds: Math.max(4, 10 - difficulty),
  };
}

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function commonRuntime(ctx) {
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
      raf = requestAnimationFrame(tick);
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

function mountTapRush(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const area = node("div", "game-area tap-rush");
  const target = node("button", "tap-target", "●");
  target.type = "button";
  target.setAttribute("aria-label", "Tap the target");
  area.append(target);
  host.append(area);

  let hits = 0;
  const required = config.variant.hits;
  const started = performance.now();

  const moveTarget = () => {
    const margin = 18;
    const x = margin + Math.random() * Math.max(20, area.clientWidth - 86);
    const y = margin + Math.random() * Math.max(20, area.clientHeight - 86);
    target.style.left = `${x}px`;
    target.style.top = `${y}px`;
    target.style.transform = `scale(${0.88 + Math.random() * 0.24})`;
  };

  runtime.on(target, "pointerdown", (event) => {
    event.preventDefault();
    ctx.interact("target_hit", { hit: hits + 1 });
    ctx.haptic(8);
    ctx.tone(520 + hits * 45, 0.035);
    hits += 1;
    target.classList.remove("pop");
    void target.offsetWidth;
    target.classList.add("pop");
    if (hits >= required) {
      const elapsed = Math.round(performance.now() - started);
      runtime.finish("complete", { score: Math.max(100, 1200 - elapsed), detail: `${hits}/${required} hits` });
    } else {
      moveTarget();
    }
  });

  requestAnimationFrame(moveTarget);
  runtime.later(() => runtime.finish("fail", { score: hits * 90, detail: `${hits}/${required} hits` }), config.variant.timeMs);
  return runtime;
}

function mountPerfectStop(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area stop-game");
  const track = node("div", "stop-track");
  const zone = node("div", "stop-zone");
  const marker = node("div", "stop-marker");
  const button = node("button", "primary-game-button", "STOP");
  button.type = "button";
  zone.style.left = `${config.variant.zoneLeft}%`;
  zone.style.width = `${config.variant.zoneWidth}%`;
  track.append(zone, marker);
  wrap.append(track, button);
  host.append(wrap);

  const startedAt = performance.now();
  const speed = config.variant.speed;
  let current = 0;

  runtime.loop((time) => {
    const phase = ((time - startedAt) * speed) % 200;
    current = phase <= 100 ? phase : 200 - phase;
    marker.style.left = `${current}%`;
  });

  runtime.on(button, "click", () => {
    ctx.interact("stop_pressed", { marker_pct: Math.round(current) });
    const center = config.variant.zoneLeft + config.variant.zoneWidth / 2;
    const distance = Math.abs(current - center);
    const inside = current >= config.variant.zoneLeft && current <= config.variant.zoneLeft + config.variant.zoneWidth;
    if (inside) {
      ctx.haptic([8, 30, 8]);
      ctx.tone(700, 0.08);
      runtime.finish("complete", { score: Math.round(Math.max(100, 1000 - distance * 65)), detail: `${distance.toFixed(1)}% from center` });
    } else {
      ctx.haptic(25);
      runtime.finish("fail", { score: Math.round(Math.max(0, 500 - distance * 20)), detail: `${distance.toFixed(1)}% away` });
    }
  });

  return runtime;
}

function mountBiggerNumber(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area number-game");
  const prompt = node("div", "game-prompt", "Pick the bigger number");
  const row = node("div", "choice-row");
  const left = node("button", "number-choice");
  const right = node("button", "number-choice");
  left.type = right.type = "button";
  row.append(left, right);
  wrap.append(prompt, row);
  host.append(wrap);

  let round = 0;
  let score = 0;
  let values = [0, 0];

  const newRound = () => {
    const base = int(Math.random, 5, 80 + config.difficulty * 40);
    const delta = int(Math.random, Math.max(1, 9 - config.difficulty), 28);
    values = Math.random() > 0.5 ? [base, base + delta] : [base + delta, base];
    left.textContent = String(values[0]);
    right.textContent = String(values[1]);
    prompt.textContent = `Round ${round + 1}/${config.variant.rounds}`;
  };

  const choose = (index) => {
    ctx.interact("number_choice", { round, side: index === 0 ? "left" : "right" });
    if (values[index] !== Math.max(...values)) {
      runtime.finish("fail", { score, detail: `Reached round ${round + 1}` });
      return;
    }
    ctx.tone(580 + round * 30, 0.04);
    score += 180 + config.difficulty * 20;
    round += 1;
    if (round >= config.variant.rounds) runtime.finish("complete", { score, detail: `${round} correct` });
    else newRound();
  };

  runtime.on(left, "click", () => choose(0));
  runtime.on(right, "click", () => choose(1));
  newRound();
  return runtime;
}

function mountReaction(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area reaction-game");
  const orb = node("button", "reaction-orb", "WAIT");
  orb.type = "button";
  wrap.append(orb);
  host.append(wrap);

  let ready = false;
  let goAt = 0;

  runtime.later(() => {
    ready = true;
    goAt = performance.now();
    orb.textContent = "GO";
    orb.classList.add("is-go");
    ctx.tone(760, 0.045);
  }, config.variant.delayMs);

  runtime.on(orb, "pointerdown", () => {
    ctx.interact("reaction_tap", { ready });
    if (!ready) {
      runtime.finish("fail", { score: 0, detail: "Too early" });
      return;
    }
    const ms = Math.round(performance.now() - goAt);
    const score = Math.max(100, 1200 - ms * 2);
    ctx.haptic(10);
    runtime.finish("complete", { score, detail: `${ms} ms` });
  });

  return runtime;
}

function mountSymbolHunt(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area symbol-game");
  const target = config.variant.target;
  const prompt = node("div", "symbol-prompt", `Tap ${target}`);
  const grid = node("div", "symbol-grid");
  wrap.append(prompt, grid);
  host.append(wrap);

  const total = config.variant.cells;
  const targetIndex = config.variant.targetIndex % total;
  for (let i = 0; i < total; i += 1) {
    const symbol = i === targetIndex ? target : choice(SYMBOLS.filter((item) => item !== target), Math.random);
    const button = node("button", "symbol-cell", symbol);
    button.type = "button";
    button.style.transform = `rotate(${(i * 17 + config.variant.rotation) % 32 - 16}deg)`;
    runtime.on(button, "click", () => {
      ctx.interact("symbol_choice", { index: i, correct: i === targetIndex });
      if (i === targetIndex) runtime.finish("complete", { score: 700 + config.difficulty * 70, detail: `${total} tiles` });
      else runtime.finish("fail", { score: 0, detail: "Wrong shape" });
    });
    grid.append(button);
  }
  return runtime;
}

function mountMemory(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area memory-game");
  const prompt = node("div", "game-prompt", "Watch the pattern");
  const grid = node("div", "memory-grid");
  wrap.append(prompt, grid);
  host.append(wrap);

  const pads = Array.from({ length: 4 }, (_, index) => {
    const button = node("button", `memory-pad pad-${index + 1}`);
    button.type = "button";
    button.disabled = true;
    grid.append(button);
    return button;
  });

  const sequence = config.variant.sequence;
  let inputIndex = 0;

  const flash = (padIndex, ms = 240) => {
    pads[padIndex].classList.add("lit");
    ctx.tone(360 + padIndex * 120, 0.05);
    runtime.later(() => pads[padIndex].classList.remove("lit"), ms);
  };

  sequence.forEach((padIndex, index) => {
    runtime.later(() => flash(padIndex), 550 + index * config.variant.flashGapMs);
  });

  runtime.later(() => {
    prompt.textContent = "Your turn";
    pads.forEach((pad) => { pad.disabled = false; });
  }, 650 + sequence.length * config.variant.flashGapMs);

  pads.forEach((pad, padIndex) => {
    runtime.on(pad, "click", () => {
      if (pad.disabled) return;
      ctx.interact("memory_pad", { input_index: inputIndex, pad: padIndex });
      flash(padIndex, 120);
      if (sequence[inputIndex] !== padIndex) {
        runtime.finish("fail", { score: inputIndex * 130, detail: `${inputIndex}/${sequence.length} remembered` });
        return;
      }
      inputIndex += 1;
      if (inputIndex >= sequence.length) {
        runtime.finish("complete", { score: 600 + sequence.length * 120, detail: `${sequence.length} remembered` });
      }
    });
  });

  return runtime;
}

function mountSwipeCall(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area swipe-call");
  const arrow = node("div", "direction-arrow");
  const label = node("div", "direction-label", config.variant.direction);
  const arrows = { LEFT: "←", RIGHT: "→", DOWN: "↓" };
  arrow.textContent = arrows[config.variant.direction];
  wrap.append(arrow, label);
  host.append(wrap);

  let start = null;
  runtime.on(wrap, "pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY };
    wrap.setPointerCapture?.(event.pointerId);
  });
  runtime.on(wrap, "pointerup", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    let direction = null;
    if (Math.max(absX, absY) >= 45) {
      if (absX > absY) direction = dx > 0 ? "RIGHT" : "LEFT";
      else direction = dy > 0 ? "DOWN" : "UP";
    }
    ctx.interact("direction_swipe", { direction });
    if (direction === config.variant.direction) {
      ctx.haptic(8);
      runtime.finish("complete", { score: 760 + config.difficulty * 50, detail: "Clean swipe" });
    } else {
      runtime.finish("fail", { score: 0, detail: direction ? `You swiped ${direction}` : "Swipe farther" });
    }
    start = null;
  });
  return runtime;
}

function mountLaneDodge(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area lane-game");
  const lanes = node("div", "lanes");
  const player = node("div", "lane-player", "◆");
  const obstacle = node("div", "lane-obstacle", "▰");
  const hint = node("div", "lane-hint", "Tap a lane");
  lanes.append(player, obstacle, hint);
  wrap.append(lanes);
  host.append(wrap);

  let lane = 1;
  const obstacleLane = config.variant.obstacleLane;
  let progress = 0;
  let last = performance.now();
  const duration = config.variant.durationMs;

  const renderLane = () => {
    player.style.left = `${lane * 33.333 + 16.666}%`;
    obstacle.style.left = `${obstacleLane * 33.333 + 16.666}%`;
  };

  runtime.on(lanes, "pointerdown", (event) => {
    const rect = lanes.getBoundingClientRect();
    lane = Math.min(2, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * 3)));
    ctx.interact("lane_change", { lane });
    renderLane();
  });

  runtime.loop((time) => {
    const dt = time - last;
    last = time;
    progress += dt / duration;
    obstacle.style.top = `${-12 + progress * 104}%`;
    if (progress >= 0.72 && progress <= 0.88 && lane === obstacleLane) {
      runtime.finish("fail", { score: Math.round(progress * 700), detail: "Collision" });
      return;
    }
    if (progress >= 1) {
      runtime.finish("complete", { score: 850 + config.difficulty * 45, detail: "Dodged" });
    }
  });

  renderLane();
  return runtime;
}

function mountQuickCount(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area count-game");
  const cloud = node("div", "count-cloud");
  const choices = node("div", "count-choices");
  wrap.append(cloud, choices);
  host.append(wrap);

  for (let i = 0; i < config.variant.count; i += 1) {
    const dot = node("span", "count-dot", config.variant.symbol);
    dot.style.left = `${8 + Math.random() * 82}%`;
    dot.style.top = `${8 + Math.random() * 72}%`;
    dot.style.transform = `scale(${0.7 + Math.random() * 0.6}) rotate(${Math.random() * 50 - 25}deg)`;
    cloud.append(dot);
  }

  config.variant.answers.forEach((answer) => {
    const button = node("button", "count-choice", String(answer));
    button.type = "button";
    runtime.on(button, "click", () => {
      ctx.interact("count_choice", { answer });
      if (answer === config.variant.count) runtime.finish("complete", { score: 720, detail: `${answer} counted` });
      else runtime.finish("fail", { score: 0, detail: `It was ${config.variant.count}` });
    });
    choices.append(button);
  });
  return runtime;
}

function mountHoldBalance(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area hold-game");
  const ring = node("button", "hold-ring");
  ring.type = "button";
  const inner = node("div", "hold-inner", "HOLD");
  const progress = node("div", "hold-progress");
  ring.append(progress, inner);
  wrap.append(ring);
  host.append(wrap);

  let downAt = null;
  let held = 0;
  const target = config.variant.targetMs;

  runtime.on(ring, "pointerdown", (event) => {
    event.preventDefault();
    downAt = performance.now();
    ring.setPointerCapture?.(event.pointerId);
    ctx.interact("hold_start");
    runtime.loop((time) => {
      if (downAt === null) return;
      held = time - downAt;
      progress.style.transform = `scaleY(${Math.min(1, held / target)})`;
      if (held >= target) {
        ctx.haptic([7, 20, 7]);
        runtime.finish("complete", { score: 800 + config.difficulty * 50, detail: `${Math.round(held)} ms` });
      }
    });
  });

  const release = () => {
    if (downAt === null || runtime.isFinished()) return;
    held = performance.now() - downAt;
    downAt = null;
    ctx.interact("hold_release", { held_ms: Math.round(held) });
    runtime.finish("fail", { score: Math.round((held / target) * 500), detail: `Held ${Math.round(held)} ms` });
  };
  runtime.on(ring, "pointerup", release);
  runtime.on(ring, "pointercancel", release);
  return runtime;
}

function mountOddOne(host, config, ctx) {
  const runtime = commonRuntime(ctx);
  const wrap = node("div", "game-area odd-game");
  const prompt = node("div", "game-prompt", "Find the odd one");
  const grid = node("div", "odd-grid");
  wrap.append(prompt, grid);
  host.append(wrap);

  for (let i = 0; i < config.variant.cells; i += 1) {
    const isOdd = i === config.variant.oddIndex;
    const button = node("button", "odd-cell", isOdd ? config.variant.odd : config.variant.normal);
    button.type = "button";
    button.style.fontSize = `${config.variant.size}px`;
    runtime.on(button, "click", () => {
      ctx.interact("odd_choice", { index: i, correct: isOdd });
      if (isOdd) runtime.finish("complete", { score: 760 + config.difficulty * 55, detail: `${config.variant.cells} tiles` });
      else runtime.finish("fail", { score: 0, detail: "Wrong tile" });
    });
    grid.append(button);
  }
  return runtime;
}

export const GAME_DEFINITIONS = [
  {
    id: "tap-rush",
    title: "Tap Rush",
    category: "reaction",
    instruction: "Hit every target before time runs out",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), hits: 4 + difficulty, timeMs: 7000 - difficulty * 450 }),
    mount: mountTapRush,
  },
  {
    id: "perfect-stop",
    title: "Perfect Stop",
    category: "timing",
    instruction: "Stop the marker inside the zone",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), zoneLeft: int(random, 18, 68), zoneWidth: Math.max(10, 25 - difficulty * 2), speed: 0.045 + difficulty * 0.009 }),
    mount: mountPerfectStop,
  },
  {
    id: "bigger-number",
    title: "Bigger Wins",
    category: "brain",
    instruction: "Pick the larger number",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), rounds: 3 + Math.min(3, difficulty) }),
    mount: mountBiggerNumber,
  },
  {
    id: "reaction-light",
    title: "Green Light",
    category: "reaction",
    instruction: "Tap only when it says GO",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), delayMs: int(random, 800, 2100) }),
    mount: mountReaction,
  },
  {
    id: "symbol-hunt",
    title: "Symbol Hunt",
    category: "focus",
    instruction: "Find the matching symbol",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), target: choice(SYMBOLS, random), cells: difficulty >= 4 ? 16 : 12, targetIndex: int(random, 0, 15), rotation: int(random, -12, 12) }),
    mount: mountSymbolHunt,
  },
  {
    id: "memory-flash",
    title: "Flash Memory",
    category: "memory",
    instruction: "Watch, then repeat the pattern",
    createVariant: ({ random, difficulty }) => {
      const length = 3 + difficulty;
      return { ...baseVariant(random, difficulty), sequence: Array.from({ length }, () => int(random, 0, 3)), flashGapMs: Math.max(280, 520 - difficulty * 35) };
    },
    mount: mountMemory,
  },
  {
    id: "swipe-call",
    title: "Swipe Call",
    category: "reflex",
    instruction: "Swipe in the shown direction",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), direction: choice(DIRECTIONS, random) }),
    mount: mountSwipeCall,
  },
  {
    id: "lane-dodge",
    title: "Lane Dodge",
    category: "arcade",
    instruction: "Tap a lane and avoid the block",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), obstacleLane: int(random, 0, 2), durationMs: Math.max(1250, 2400 - difficulty * 180) }),
    mount: mountLaneDodge,
  },
  {
    id: "quick-count",
    title: "Quick Count",
    category: "brain",
    instruction: "Count the shapes and choose fast",
    createVariant: ({ random, difficulty }) => {
      const count = int(random, 4 + difficulty, 7 + difficulty * 2);
      const options = new Set([count]);
      while (options.size < 3) options.add(Math.max(1, count + int(random, -3, 3)));
      return { ...baseVariant(random, difficulty), count, answers: [...options].sort(() => random() - 0.5), symbol: choice(["●", "◆", "✦"], random) };
    },
    mount: mountQuickCount,
  },
  {
    id: "hold-steady",
    title: "Hold Steady",
    category: "control",
    instruction: "Press and hold until the ring fills",
    createVariant: ({ random, difficulty }) => ({ ...baseVariant(random, difficulty), targetMs: int(random, 800, 1200) + difficulty * 140 }),
    mount: mountHoldBalance,
  },
  {
    id: "odd-one",
    title: "Odd One",
    category: "focus",
    instruction: "Spot the different tile",
    createVariant: ({ random, difficulty }) => {
      const pairs = [["●", "○"], ["◆", "◇"], ["▲", "△"], ["■", "□"], ["✦", "✧"]];
      const [normal, odd] = choice(pairs, random);
      const cells = difficulty >= 4 ? 20 : 16;
      return { ...baseVariant(random, difficulty), normal, odd, cells, oddIndex: int(random, 0, cells - 1), size: difficulty >= 4 ? 30 : 36 };
    },
    mount: mountOddOne,
  },
];
