import { GAME_DEFINITIONS } from "./games.js";

const PALETTES = [
  ["#7c5cff", "#16d9e3", "#0f1021"],
  ["#ff5c8a", "#ffb347", "#1c1020"],
  ["#3ddc97", "#5b8cff", "#071a1a"],
  ["#f4d35e", "#ee6c4d", "#17130b"],
  ["#9b5de5", "#00bbf9", "#10101d"],
  ["#00f5d4", "#f15bb5", "#071719"],
];

function choice(items, random) {
  return items[Math.floor(random() * items.length)];
}

function int(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function baseVariant(random, difficulty) {
  const [accent, accent2, background] = choice(PALETTES, random);
  return { accent, accent2, background, difficulty };
}

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function runtime(ctx) {
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

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mountDodgeStream(host, config, ctx) {
  const rt = runtime(ctx);
  const wrap = node("div", "game-area dodge-stream-game");
  const lanes = node("div", "stream-lanes");
  const player = node("div", "stream-player", "◆");
  const status = node("div", "stream-status", `Dodge ${config.variant.hazardLanes.length} hazards`);
  lanes.append(player, status);
  wrap.append(lanes);
  host.append(wrap);

  let lane = 1;
  let last = performance.now();
  let passed = 0;
  const hazards = [];

  const renderPlayer = () => {
    player.style.left = `${lane * 33.333 + 16.666}%`;
  };

  const spawnHazard = (hazardLane, wave) => {
    const el = node("div", "stream-hazard", "▰");
    el.style.left = `${hazardLane * 33.333 + 16.666}%`;
    lanes.append(el);
    hazards.push({ el, lane: hazardLane, wave, progress: 0, active: true });
    ctx.interact("hazard_spawned", { wave, lane: hazardLane });
  };

  config.variant.hazardLanes.forEach((hazardLane, index) => {
    rt.later(() => spawnHazard(hazardLane, index + 1), index * config.variant.gapMs);
  });

  rt.on(lanes, "pointerdown", (event) => {
    const rect = lanes.getBoundingClientRect();
    lane = Math.min(2, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * 3)));
    ctx.interact("lane_change", { lane });
    renderPlayer();
  });

  rt.loop((time) => {
    const dt = Math.min(50, Math.max(0, time - last));
    last = time;

    for (const hazard of hazards) {
      if (!hazard.active) continue;
      hazard.progress += dt / config.variant.durationMs;
      hazard.el.style.top = `${-12 + hazard.progress * 108}%`;

      if (hazard.progress >= 0.72 && hazard.progress <= 0.9 && lane === hazard.lane) {
        ctx.interact("hazard_collision", { wave: hazard.wave, lane });
        rt.finish("fail", {
          score: passed * 180,
          detail: `Hit on hazard ${hazard.wave}/${config.variant.hazardLanes.length}`,
        });
        return;
      }

      if (hazard.progress >= 1) {
        hazard.active = false;
        hazard.el.remove();
        passed += 1;
        status.textContent = `${passed}/${config.variant.hazardLanes.length} dodged`;
        ctx.interact("hazard_dodged", { wave: hazard.wave, passed });
        if (passed >= config.variant.hazardLanes.length) {
          ctx.haptic([8, 24, 8]);
          rt.finish("complete", {
            score: 900 + passed * 90 + config.difficulty * 55,
            detail: `${passed} hazards dodged`,
          });
          return;
        }
      }
    }
  });

  renderPlayer();
  return rt;
}

function mountJumpRush(host, config, ctx) {
  const rt = runtime(ctx);
  const area = node("div", "game-area jump-rush-game");
  const target = node("button", "jump-target", "●");
  const counter = node("div", "jump-counter", `0/${config.variant.hits}`);
  const missesLabel = node("div", "jump-misses", `${config.variant.allowedMisses} saves`);
  target.type = "button";
  target.setAttribute("aria-label", "Tap the moving target before its ring expires");
  area.append(counter, missesLabel, target);
  host.append(area);

  let hits = 0;
  let misses = 0;
  let deadline = performance.now() + config.variant.jumpMs;
  const started = performance.now();

  const moveTarget = () => {
    const margin = 20;
    const width = Math.max(120, area.clientWidth);
    const height = Math.max(260, area.clientHeight);
    const x = margin + Math.random() * Math.max(30, width - 92);
    const y = 52 + Math.random() * Math.max(40, height - 142);
    target.style.left = `${x}px`;
    target.style.top = `${y}px`;
    deadline = performance.now() + config.variant.jumpMs;
  };

  const missAndJump = () => {
    misses += 1;
    ctx.interact("target_timeout_jump", { misses, allowed: config.variant.allowedMisses });
    if (misses > config.variant.allowedMisses) {
      rt.finish("fail", {
        score: hits * 120,
        detail: `${hits}/${config.variant.hits} hits · too slow`,
      });
      return;
    }
    missesLabel.textContent = `${config.variant.allowedMisses - misses + 1} saves`;
    moveTarget();
  };

  rt.on(target, "pointerdown", (event) => {
    event.preventDefault();
    hits += 1;
    counter.textContent = `${hits}/${config.variant.hits}`;
    ctx.interact("target_hit", {
      hit: hits,
      response_ms: Math.max(0, Math.round(config.variant.jumpMs - (deadline - performance.now()))),
    });
    ctx.haptic(7);
    ctx.tone(520 + hits * 40, 0.035);

    if (hits >= config.variant.hits) {
      const elapsed = Math.round(performance.now() - started);
      rt.finish("complete", {
        score: Math.max(300, 1500 - Math.round(elapsed / 8) - misses * 100),
        detail: `${hits} hits · ${misses} misses`,
      });
      return;
    }
    moveTarget();
  });

  rt.loop((time) => {
    if (rt.isFinished()) return;
    const remaining = Math.max(0, deadline - time);
    const ratio = Math.max(0, Math.min(1, remaining / config.variant.jumpMs));
    target.style.setProperty("--jump-progress", `${ratio * 360}deg`);
    if (remaining <= 0) missAndJump();
  });

  requestAnimationFrame(moveTarget);
  return rt;
}

function mountMicroSnake(host, config, ctx) {
  const rt = runtime(ctx);
  const wrap = node("div", "game-area snake-game");
  const status = node("div", "snake-status", `Eat ${config.variant.goal}`);
  const grid = node("div", "snake-grid");
  const controls = node("div", "snake-controls");
  const cells = Array.from({ length: 64 }, () => node("div", "snake-cell"));
  cells.forEach((cell) => grid.append(cell));

  const buttons = [
    ["up", "↑"],
    ["left", "←"],
    ["down", "↓"],
    ["right", "→"],
  ].map(([direction, label]) => {
    const button = node("button", `snake-control snake-${direction}`, label);
    button.type = "button";
    button.setAttribute("aria-label", `Move ${direction}`);
    controls.append(button);
    return [direction, button];
  });

  wrap.append(status, grid, controls);
  host.append(wrap);

  const random = seededRandom(config.variant.seed);
  let snake = [{ x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }];
  let direction = "right";
  let pendingDirection = direction;
  let food = null;
  let eaten = 0;
  const vectors = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const opposite = { up: "down", down: "up", left: "right", right: "left" };

  const indexFor = ({ x, y }) => y * 8 + x;
  const contains = (point) => snake.some((part) => part.x === point.x && part.y === point.y);

  const placeFood = () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = { x: Math.floor(random() * 8), y: Math.floor(random() * 8) };
      if (!contains(candidate)) {
        food = candidate;
        return;
      }
    }
  };

  const render = () => {
    cells.forEach((cell) => {
      cell.className = "snake-cell";
      cell.textContent = "";
    });
    snake.forEach((part, index) => {
      const cell = cells[indexFor(part)];
      cell.classList.add(index === 0 ? "snake-head" : "snake-body");
    });
    if (food) {
      const foodCell = cells[indexFor(food)];
      foodCell.classList.add("snake-food");
      foodCell.textContent = "●";
    }
    status.textContent = `${eaten}/${config.variant.goal} eaten`;
  };

  const turn = (next) => {
    if (next === opposite[direction]) return;
    pendingDirection = next;
    ctx.interact("snake_turn", { direction: next });
  };

  buttons.forEach(([next, button]) => rt.on(button, "click", () => turn(next)));

  const step = () => {
    direction = pendingDirection;
    const vector = vectors[direction];
    const head = snake[0];
    const next = { x: head.x + vector.x, y: head.y + vector.y };

    const outside = next.x < 0 || next.x >= 8 || next.y < 0 || next.y >= 8;
    const intoSelf = !outside && snake.some((part, index) => index < snake.length - 1 && part.x === next.x && part.y === next.y);
    if (outside || intoSelf) {
      ctx.interact("snake_collision", { outside, length: snake.length, eaten });
      rt.finish("fail", { score: eaten * 240, detail: `${eaten}/${config.variant.goal} eaten` });
      return;
    }

    snake.unshift(next);
    if (food && next.x === food.x && next.y === food.y) {
      eaten += 1;
      ctx.interact("snake_eat", { eaten, goal: config.variant.goal });
      ctx.tone(620 + eaten * 60, 0.04);
      ctx.haptic(6);
      if (eaten >= config.variant.goal) {
        render();
        rt.finish("complete", {
          score: 800 + eaten * 180 + config.difficulty * 60,
          detail: `${eaten} eaten`,
        });
        return;
      }
      placeFood();
    } else {
      snake.pop();
    }
    render();
  };

  placeFood();
  render();
  rt.every(step, config.variant.tickMs);
  return rt;
}

const MATCH_SYMBOLS = ["●", "◆", "▲", "■", "✦"];

function mountMicroMatch(host, config, ctx) {
  const rt = runtime(ctx);
  const wrap = node("div", "game-area match-game");
  const status = node("div", "match-status");
  const grid = node("div", "match-grid");
  wrap.append(status, grid);
  host.append(wrap);

  const random = seededRandom(config.variant.seed);
  const size = 5;
  let movesLeft = config.variant.moves;
  let cleared = 0;
  let selected = null;
  let board = [];
  const cells = Array.from({ length: size * size }, (_, index) => {
    const button = node("button", "match-cell");
    button.type = "button";
    button.dataset.index = String(index);
    grid.append(button);
    return button;
  });

  const swap = (a, b) => {
    [board[a], board[b]] = [board[b], board[a]];
  };

  const findMatches = () => {
    const matched = new Set();
    for (let row = 0; row < size; row += 1) {
      let start = 0;
      while (start < size) {
        const value = board[row * size + start];
        let end = start + 1;
        while (end < size && value !== null && board[row * size + end] === value) end += 1;
        if (value !== null && end - start >= 3) {
          for (let col = start; col < end; col += 1) matched.add(row * size + col);
        }
        start = end;
      }
    }
    for (let col = 0; col < size; col += 1) {
      let start = 0;
      while (start < size) {
        const value = board[start * size + col];
        let end = start + 1;
        while (end < size && value !== null && board[end * size + col] === value) end += 1;
        if (value !== null && end - start >= 3) {
          for (let row = start; row < end; row += 1) matched.add(row * size + col);
        }
        start = end;
      }
    }
    return matched;
  };

  const adjacent = (a, b) => {
    const ar = Math.floor(a / size);
    const ac = a % size;
    const br = Math.floor(b / size);
    const bc = b % size;
    return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
  };

  const hasValidSwap = () => {
    for (let index = 0; index < board.length; index += 1) {
      const right = index % size < size - 1 ? index + 1 : -1;
      const down = index + size < board.length ? index + size : -1;
      for (const other of [right, down]) {
        if (other < 0) continue;
        swap(index, other);
        const valid = findMatches().size > 0;
        swap(index, other);
        if (valid) return true;
      }
    }
    return false;
  };

  const buildBoard = () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = [];
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const disallowed = new Set();
          if (col >= 2 && candidate[row * size + col - 1] === candidate[row * size + col - 2]) {
            disallowed.add(candidate[row * size + col - 1]);
          }
          if (row >= 2 && candidate[(row - 1) * size + col] === candidate[(row - 2) * size + col]) {
            disallowed.add(candidate[(row - 1) * size + col]);
          }
          const choices = [0, 1, 2, 3, 4].filter((value) => !disallowed.has(value));
          candidate.push(choice(choices, random));
        }
      }
      board = candidate;
      if (hasValidSwap()) return;
    }
  };

  const collapse = () => {
    for (let col = 0; col < size; col += 1) {
      const values = [];
      for (let row = size - 1; row >= 0; row -= 1) {
        const value = board[row * size + col];
        if (value !== null) values.push(value);
      }
      for (let row = size - 1, offset = 0; row >= 0; row -= 1, offset += 1) {
        board[row * size + col] = offset < values.length ? values[offset] : Math.floor(random() * MATCH_SYMBOLS.length);
      }
    }
  };

  const render = () => {
    status.textContent = `${cleared}/${config.variant.targetClears} cleared · ${movesLeft} moves`;
    cells.forEach((cell, index) => {
      const value = board[index];
      cell.textContent = MATCH_SYMBOLS[value];
      cell.className = `match-cell match-color-${value}`;
      if (selected === index) cell.classList.add("is-selected");
    });
  };

  const resolveBoard = (initialMatches) => {
    let matches = initialMatches;
    let cascade = 0;
    while (matches.size > 0 && cascade < 8) {
      const amount = matches.size;
      matches.forEach((index) => { board[index] = null; });
      cleared += amount;
      cascade += 1;
      ctx.interact("match_clear", { amount, cascade, cleared });
      collapse();
      matches = findMatches();
    }

    if (cleared >= config.variant.targetClears) {
      render();
      ctx.haptic([8, 20, 8]);
      rt.finish("complete", {
        score: 700 + cleared * 70 + movesLeft * 120 + config.difficulty * 40,
        detail: `${cleared} cleared · ${movesLeft} moves left`,
      });
      return;
    }
    if (movesLeft <= 0) {
      render();
      rt.finish("fail", {
        score: cleared * 70,
        detail: `${cleared}/${config.variant.targetClears} cleared`,
      });
      return;
    }
    render();
  };

  cells.forEach((cell, index) => {
    rt.on(cell, "click", () => {
      if (selected === null) {
        selected = index;
        ctx.interact("match_select", { index });
        render();
        return;
      }
      if (selected === index) {
        selected = null;
        render();
        return;
      }
      if (!adjacent(selected, index)) {
        selected = index;
        ctx.interact("match_reselect", { index });
        render();
        return;
      }

      const first = selected;
      selected = null;
      swap(first, index);
      const matches = findMatches();
      if (matches.size === 0) {
        swap(first, index);
        ctx.interact("match_invalid_swap", { from: first, to: index });
        cell.classList.add("match-invalid");
        rt.later(() => cell.classList.remove("match-invalid"), 180);
        render();
        return;
      }

      movesLeft -= 1;
      ctx.interact("match_swap", { from: first, to: index, matches: matches.size, moves_left: movesLeft });
      ctx.tone(650, 0.04);
      resolveBoard(matches);
    });
  });

  buildBoard();
  render();
  return rt;
}

const EXTRA_GAME_DEFINITIONS = [
  {
    id: "dodge-stream",
    title: "Dodge Stream",
    category: "arcade",
    instruction: "Move the green diamond away from every falling red hazard",
    createVariant: ({ random, difficulty }) => ({
      ...baseVariant(random, difficulty),
      hazardLanes: Array.from({ length: 3 + difficulty }, () => int(random, 0, 2)),
      gapMs: Math.max(430, 900 - difficulty * 85),
      durationMs: Math.max(1050, 1850 - difficulty * 120),
    }),
    mount: mountDodgeStream,
  },
  {
    id: "jump-rush",
    title: "Jump Rush",
    category: "reaction",
    instruction: "Tap the dot before its countdown ring expires",
    createVariant: ({ random, difficulty }) => ({
      ...baseVariant(random, difficulty),
      hits: 4 + difficulty,
      jumpMs: Math.max(650, 1450 - difficulty * 125),
      allowedMisses: difficulty >= 4 ? 1 : 2,
    }),
    mount: mountJumpRush,
  },
  {
    id: "micro-snake",
    title: "Micro Snake",
    category: "arcade",
    instruction: "Use the arrows. Eat the dots without hitting a wall or yourself",
    createVariant: ({ random, difficulty }) => ({
      ...baseVariant(random, difficulty),
      goal: 2 + Math.min(3, difficulty),
      tickMs: Math.max(185, 350 - difficulty * 28),
      seed: int(random, 1, 0x7fffffff),
    }),
    mount: mountMicroSnake,
  },
  {
    id: "micro-match",
    title: "Micro Match",
    category: "puzzle",
    instruction: "Swap adjacent tiles. Match 3 or more to clear them",
    createVariant: ({ random, difficulty }) => ({
      ...baseVariant(random, difficulty),
      targetClears: 6 + difficulty * 2,
      moves: difficulty <= 2 ? 6 : 5,
      seed: int(random, 1, 0x7fffffff),
    }),
    mount: mountMicroMatch,
  },
];

const existingIds = new Set(GAME_DEFINITIONS.map((definition) => definition.id));
for (const definition of EXTRA_GAME_DEFINITIONS) {
  if (!existingIds.has(definition.id)) GAME_DEFINITIONS.push(definition);
}
