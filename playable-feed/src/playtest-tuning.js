import { GAME_DEFINITIONS } from "./games.js";

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function createRuntime(ctx) {
  const cleanups = [];
  const timeouts = new Set();
  const intervals = new Set();
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
    cleanups.forEach((cleanup) => cleanup());
  };

  return { later, every, on, finish, destroy, isFinished: () => finished };
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

function patchMemory() {
  const definition = GAME_DEFINITIONS.find((game) => game.id === "memory-flash");
  if (!definition || definition.__phoneTuned) return;
  const originalCreateVariant = definition.createVariant;

  definition.createVariant = (args) => {
    const variant = originalCreateVariant(args);
    const difficulty = Math.max(1, Math.min(5, Number(args.difficulty || 1)));
    // Phone playtest showed the old 4→8 pattern ramp felt like a sudden jump
    // from a tiny sequence to an exhausting one. Keep working-memory load tight.
    const targetLength = [0, 3, 3, 4, 4, 5][difficulty];
    return {
      ...variant,
      sequence: variant.sequence.slice(0, targetLength),
      flashGapMs: [0, 640, 620, 600, 575, 550][difficulty],
    };
  };
  definition.__phoneTuned = true;
}

function mountMicroSnakePhone(host, config, ctx) {
  const rt = createRuntime(ctx);
  const wrap = node("div", "game-area snake-game snake-game-phone");
  const status = node("div", "snake-status", "GET READY");
  const grid = node("div", "snake-grid");
  const controls = node("div", "snake-controls snake-controls-phone");
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
  let started = false;
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
      cells[indexFor(part)]?.classList.add(index === 0 ? "snake-head" : "snake-body");
    });
    if (food) {
      const foodCell = cells[indexFor(food)];
      foodCell.classList.add("snake-food");
      foodCell.textContent = "●";
    }
    status.textContent = started ? `${eaten}/${config.variant.goal} eaten · ${Math.round(config.variant.tickMs)}ms` : "GET READY";
  };

  const turn = (next) => {
    if (next === opposite[direction]) return;
    pendingDirection = next;
    ctx.interact("snake_turn", { direction: next, source: "large_button", eaten });
    ctx.haptic(4);
  };

  buttons.forEach(([next, button]) => {
    rt.on(button, "pointerdown", (event) => {
      event.preventDefault();
      turn(next);
    });
  });

  const step = () => {
    direction = pendingDirection;
    const vector = vectors[direction];
    const head = snake[0];
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    const outside = next.x < 0 || next.x >= 8 || next.y < 0 || next.y >= 8;
    const intoSelf = !outside && snake.some((part, index) => index < snake.length - 1 && part.x === next.x && part.y === next.y);

    if (outside || intoSelf) {
      ctx.interact("snake_collision", { outside, self_collision: intoSelf, length: snake.length, eaten });
      rt.finish("fail", { score: eaten * 240, detail: `${eaten}/${config.variant.goal} eaten` });
      return;
    }

    snake.unshift(next);
    if (food && next.x === food.x && next.y === food.y) {
      eaten += 1;
      ctx.interact("snake_eat", { eaten, goal: config.variant.goal, tick_ms: config.variant.tickMs });
      ctx.tone(620 + eaten * 60, 0.04);
      ctx.haptic(6);
      if (eaten >= config.variant.goal) {
        render();
        rt.finish("complete", {
          score: 800 + eaten * 180 + config.difficulty * 60,
          detail: `${eaten} eaten · ${Math.round(config.variant.tickMs)}ms speed`,
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
  ctx.interact("snake_round_ready", { goal: config.variant.goal, tick_ms: config.variant.tickMs, ready_ms: config.variant.readyMs });
  rt.later(() => {
    started = true;
    render();
    ctx.interact("snake_round_start", { goal: config.variant.goal, tick_ms: config.variant.tickMs });
    rt.every(step, config.variant.tickMs);
  }, config.variant.readyMs);
  return rt;
}

function patchSnake() {
  const definition = GAME_DEFINITIONS.find((game) => game.id === "micro-snake");
  if (!definition || definition.__phoneTuned) return;
  const originalCreateVariant = definition.createVariant;

  definition.createVariant = (args) => {
    const variant = originalCreateVariant(args);
    const difficulty = Math.max(1, Math.min(5, Number(args.difficulty || 1)));
    return {
      ...variant,
      // Old L5 was ~210ms/tick on the phone. This curve keeps reaction pressure
      // but leaves enough time to acquire the larger controls.
      tickMs: [0, 500, 465, 430, 395, 360][difficulty],
      readyMs: 900,
    };
  };
  definition.mount = mountMicroSnakePhone;
  definition.instruction = "Use the large arrows. Eat the dots without hitting a wall or yourself";
  definition.__phoneTuned = true;
}

const MATCH_SYMBOLS = ["●", "◆", "▲", "■", "✦"];

function mountMicroMatchPhone(host, config, ctx) {
  const rt = createRuntime(ctx);
  const wrap = node("div", "game-area match-game match-game-phone");
  const status = node("div", "match-status");
  const hint = node("div", "match-hint", "Swipe a tile into a neighbor · tap also works");
  const grid = node("div", "match-grid");
  grid.dataset.gameSwipeControl = "match";
  wrap.append(status, hint, grid);
  host.append(wrap);

  const random = seededRandom(config.variant.seed);
  const size = 5;
  let movesLeft = config.variant.moves;
  let cleared = 0;
  let selected = null;
  let busy = false;
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

  const adjacent = (a, b) => {
    const ar = Math.floor(a / size);
    const ac = a % size;
    const br = Math.floor(b / size);
    const bc = b % size;
    return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
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
          candidate.push(choices[Math.floor(random() * choices.length)]);
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
      cell.textContent = value === null ? "" : MATCH_SYMBOLS[value];
      cell.className = value === null ? "match-cell" : `match-cell match-color-${value}`;
      if (selected === index) cell.classList.add("is-selected");
    });
  };

  const settle = (matches, cascade = 1) => {
    if (matches.size === 0) {
      busy = false;
      render();
      if (cleared >= config.variant.targetClears) {
        ctx.haptic([8, 20, 8]);
        rt.finish("complete", {
          score: 700 + cleared * 70 + movesLeft * 120 + config.difficulty * 40,
          detail: `${cleared} cleared · ${movesLeft} moves left`,
        });
      } else if (movesLeft <= 0) {
        rt.finish("fail", { score: cleared * 70, detail: `${cleared}/${config.variant.targetClears} cleared` });
      }
      return;
    }

    matches.forEach((index) => cells[index]?.classList.add("is-clearing"));
    ctx.interact("match_clear", { amount: matches.size, cascade, cleared_before: cleared });
    ctx.tone(620 + cascade * 45, 0.04);

    rt.later(() => {
      matches.forEach((index) => { board[index] = null; });
      cleared += matches.size;
      collapse();
      render();
      cells.forEach((cell) => cell.classList.add("is-dropping"));
      ctx.interact("match_cascade", { cascade, cleared, moves_left: movesLeft });

      rt.later(() => {
        cells.forEach((cell) => cell.classList.remove("is-dropping"));
        settle(findMatches(), cascade + 1);
      }, 150);
    }, 150);
  };

  const attemptSwap = (from, to, source) => {
    if (busy || !adjacent(from, to)) return;
    busy = true;
    selected = null;

    const fromRow = Math.floor(from / size);
    const fromCol = from % size;
    const toRow = Math.floor(to / size);
    const toCol = to % size;
    const dx = toCol - fromCol;
    const dy = toRow - fromRow;
    const fromCell = cells[from];
    const toCell = cells[to];
    fromCell.style.setProperty("--swap-x", `${dx * 105}%`);
    fromCell.style.setProperty("--swap-y", `${dy * 105}%`);
    toCell.style.setProperty("--swap-x", `${-dx * 105}%`);
    toCell.style.setProperty("--swap-y", `${-dy * 105}%`);
    fromCell.classList.add("is-swapping");
    toCell.classList.add("is-swapping");
    ctx.interact(source === "swipe" ? "match_swipe" : "match_tap_swap", { from, to });

    rt.later(() => {
      fromCell.classList.remove("is-swapping");
      toCell.classList.remove("is-swapping");
      swap(from, to);
      const matches = findMatches();
      if (matches.size === 0) {
        swap(from, to);
        ctx.interact("match_invalid_swap", { from, to, source });
        fromCell.classList.add("match-invalid");
        toCell.classList.add("match-invalid");
        ctx.haptic(18);
        render();
        rt.later(() => {
          fromCell.classList.remove("match-invalid");
          toCell.classList.remove("match-invalid");
          busy = false;
        }, 190);
        return;
      }

      movesLeft -= 1;
      ctx.interact("match_swap", { from, to, source, matches: matches.size, moves_left: movesLeft });
      ctx.haptic(5);
      render();
      settle(matches, 1);
    }, 130);
  };

  let drag = null;
  cells.forEach((cell, index) => {
    rt.on(cell, "pointerdown", (event) => {
      if (busy) return;
      drag = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      cell.setPointerCapture?.(event.pointerId);
    });

    rt.on(cell, "pointerup", (event) => {
      if (!drag || busy) return;
      const start = drag;
      drag = null;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));

      if (distance >= 18) {
        let target = start.index;
        if (Math.abs(dx) > Math.abs(dy)) target += dx > 0 ? 1 : -1;
        else target += dy > 0 ? size : -size;
        if (target >= 0 && target < size * size && adjacent(start.index, target)) {
          event.preventDefault();
          attemptSwap(start.index, target, "swipe");
          return;
        }
      }

      if (selected === null) {
        selected = index;
        ctx.interact("match_select", { index });
        render();
      } else if (selected === index) {
        selected = null;
        render();
      } else if (adjacent(selected, index)) {
        attemptSwap(selected, index, "tap");
      } else {
        selected = index;
        ctx.interact("match_reselect", { index });
        render();
      }
    });

    rt.on(cell, "pointercancel", () => { drag = null; });
  });

  buildBoard();
  render();
  ctx.interact("match_round_start", { target_clears: config.variant.targetClears, moves: config.variant.moves, swipe_enabled: true });
  return rt;
}

function patchMatch() {
  const definition = GAME_DEFINITIONS.find((game) => game.id === "micro-match");
  if (!definition || definition.__phoneTuned) return;
  definition.mount = mountMicroMatchPhone;
  definition.instruction = "Swipe adjacent tiles to match 3+. Tap two neighbors also works";
  definition.__phoneTuned = true;
}

patchMemory();
patchSnake();
patchMatch();
