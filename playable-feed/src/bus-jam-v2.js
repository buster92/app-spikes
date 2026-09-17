import { GAME_DEFINITIONS } from "./games.js";

const COLORS = [
  { id: "coral", hex: "#ff6678" },
  { id: "gold", hex: "#ffd166" },
  { id: "mint", hex: "#45d9a5" },
  { id: "violet", hex: "#a66cff" },
];
const DIRECTIONS = ["up", "right", "down", "left"];
const ARROWS = { up: "↑", right: "→", down: "↓", left: "←" };
const DELTAS = {
  up: [-1, 0],
  right: [0, 1],
  down: [1, 0],
  left: [0, -1],
};

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function bitCount(mask) {
  let count = 0;
  let value = mask >>> 0;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

function pathIsClear(bus, buses, activeMask, size) {
  const [dr, dc] = DELTAS[bus.direction];
  let row = bus.row + dr;
  let col = bus.col + dc;
  while (row >= 0 && row < size && col >= 0 && col < size) {
    const blocker = buses.find((candidate) => (
      (activeMask & (1 << candidate.id)) !== 0
      && candidate.row === row
      && candidate.col === col
    ));
    if (blocker) return false;
    row += dr;
    col += dc;
  }
  return true;
}

function settleParked(parkedMask, queueIndex, passengers, buses) {
  let parked = parkedMask;
  let index = queueIndex;
  let changed = true;

  while (changed && index < passengers.length) {
    changed = false;
    for (const bus of buses) {
      if ((parked & (1 << bus.id)) === 0) continue;
      if (bus.color !== passengers[index]) continue;
      parked &= ~(1 << bus.id);
      index += 1;
      changed = true;
      break;
    }
  }

  return { parkedMask: parked, queueIndex: index };
}

function isSolvable(puzzle) {
  const { buses, passengers, size, parkingSlots } = puzzle;
  const initialMask = (1 << buses.length) - 1;
  const queue = [{ activeMask: initialMask, parkedMask: 0, queueIndex: 0 }];
  const seen = new Set();

  while (queue.length) {
    const state = queue.shift();
    const key = `${state.activeMask}:${state.parkedMask}:${state.queueIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (state.queueIndex >= passengers.length) return true;

    for (const bus of buses) {
      const bit = 1 << bus.id;
      if ((state.activeMask & bit) === 0) continue;
      if (!pathIsClear(bus, buses, state.activeMask, size)) continue;

      const activeMask = state.activeMask & ~bit;
      let parkedMask = state.parkedMask;
      let queueIndex = state.queueIndex;

      if (bus.color === passengers[queueIndex]) {
        queueIndex += 1;
      } else {
        if (bitCount(parkedMask) >= parkingSlots) continue;
        parkedMask |= bit;
      }

      const settled = settleParked(parkedMask, queueIndex, passengers, buses);
      queue.push({ activeMask, ...settled });
    }
  }

  return false;
}

function createPuzzle(random, difficulty) {
  const size = difficulty >= 4 ? 4 : 3;
  const busCount = [0, 6, 6, 7, 8, 9][difficulty];
  const parkingSlots = difficulty >= 4 ? 2 : 3;
  const colorCount = difficulty >= 4 ? 4 : 3;
  const colorIds = COLORS.slice(0, colorCount).map((color) => color.id);
  const cells = Array.from({ length: size * size }, (_, index) => ({
    row: Math.floor(index / size),
    col: index % size,
  }));

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const positions = shuffle(cells, random).slice(0, busCount);
    const busColors = shuffle(
      Array.from({ length: busCount }, (_, index) => colorIds[index % colorIds.length]),
      random,
    );
    const buses = positions.map((position, id) => ({
      id,
      ...position,
      direction: DIRECTIONS[Math.floor(random() * DIRECTIONS.length)],
      color: busColors[id],
    }));
    const passengers = shuffle(busColors, random);
    const activeMask = (1 << buses.length) - 1;
    const free = buses.filter((bus) => pathIsClear(bus, buses, activeMask, size));

    if (free.length < 2) continue;
    if (difficulty === 1 && !free.some((bus) => bus.color === passengers[0])) {
      const firstFreeColor = free[0].color;
      const swapIndex = passengers.indexOf(firstFreeColor);
      if (swapIndex >= 0) [passengers[0], passengers[swapIndex]] = [passengers[swapIndex], passengers[0]];
    }

    const puzzle = { size, buses, passengers, parkingSlots };
    if (isSolvable(puzzle)) return puzzle;
  }

  // Small deterministic fallback: edge-facing buses always unlock the board.
  const fallback = [
    { row: 0, col: 0, direction: "left" },
    { row: 0, col: 1, direction: "up" },
    { row: 0, col: 2, direction: "right" },
    { row: 1, col: 0, direction: "left" },
    { row: 1, col: 2, direction: "right" },
    { row: 2, col: 1, direction: "down" },
  ].map((bus, id) => ({ ...bus, id, color: colorIds[id % colorIds.length] }));
  return {
    size: 3,
    buses: fallback,
    passengers: fallback.map((bus) => bus.color),
    parkingSlots: 3,
  };
}

function createRuntime(ctx) {
  const cleanups = [];
  const timeouts = new Set();
  let finished = false;

  const on = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  const later = (fn, ms) => {
    const handle = setTimeout(() => {
      timeouts.delete(handle);
      if (!finished) fn();
    }, ms);
    timeouts.add(handle);
  };
  const finish = (kind, payload) => {
    if (finished) return;
    finished = true;
    if (kind === "complete") ctx.complete(payload);
    else ctx.fail(payload);
  };
  const destroy = () => {
    finished = true;
    timeouts.forEach(clearTimeout);
    cleanups.forEach((cleanup) => cleanup());
  };
  return { on, later, finish, destroy, isFinished: () => finished };
}

function mountBusEscape(host, config, ctx) {
  const rt = createRuntime(ctx);
  const wrap = node("div", "game-area bus-escape-game");
  const passengerHeader = node("div", "bus-escape-label", "PASSENGERS · FRONT FIRST");
  const passengerLine = node("div", "bus-escape-passengers");
  const parkingHeader = node("div", "bus-escape-label", "PARKING");
  const parking = node("div", "bus-escape-parking");
  const tip = node("div", "bus-escape-tip", "Tap a bus whose arrow has a clear path out");
  const board = node("div", "bus-escape-board");
  const status = node("div", "bus-escape-status");
  wrap.append(passengerHeader, passengerLine, parkingHeader, parking, tip, board, status);
  host.append(wrap);

  const buses = config.variant.buses;
  const passengers = [...config.variant.passengers];
  const active = new Set(buses.map((bus) => bus.id));
  const parked = [];
  const byId = new Map(buses.map((bus) => [bus.id, bus]));
  let blockedTaps = 0;
  let parkedUses = 0;
  let busy = false;

  board.style.setProperty("--bus-grid-size", String(config.variant.size));

  const colorHex = (id) => COLORS.find((color) => color.id === id)?.hex || "#ffffff";
  const activeMask = () => {
    let mask = 0;
    active.forEach((id) => { mask |= (1 << id); });
    return mask;
  };
  const isFree = (bus) => pathIsClear(bus, buses, activeMask(), config.variant.size);

  const renderPassengers = () => {
    passengerLine.replaceChildren();
    passengers.slice(0, 9).forEach((color, index) => {
      const person = node("div", `bus-escape-person${index === 0 ? " is-next" : ""}`);
      person.style.setProperty("--person-color", colorHex(color));
      person.setAttribute("aria-label", `${color} passenger${index === 0 ? ", next" : ""}`);
      passengerLine.append(person);
    });
  };

  const renderParking = () => {
    parking.replaceChildren();
    for (let index = 0; index < config.variant.parkingSlots; index += 1) {
      const id = parked[index];
      const slot = node("div", `bus-escape-slot${id !== undefined ? " is-filled" : ""}`);
      if (id !== undefined) {
        const bus = byId.get(id);
        slot.style.setProperty("--bus-color", colorHex(bus.color));
        slot.textContent = ARROWS[bus.direction];
      }
      parking.append(slot);
    }
  };

  const renderBoard = () => {
    board.replaceChildren();
    const mask = activeMask();
    for (const bus of buses) {
      if (!active.has(bus.id)) continue;
      const button = node("button", `bus-escape-bus dir-${bus.direction}`);
      button.type = "button";
      button.dataset.busId = String(bus.id);
      button.style.gridRow = String(bus.row + 1);
      button.style.gridColumn = String(bus.col + 1);
      button.style.setProperty("--bus-color", colorHex(bus.color));
      button.innerHTML = `<span class="bus-windows" aria-hidden="true"><i></i><i></i><i></i></span><strong>${ARROWS[bus.direction]}</strong>`;
      const free = pathIsClear(bus, buses, mask, config.variant.size);
      if (free) button.classList.add("is-free");
      if (config.difficulty <= 1 && free && bus.color === passengers[0]) button.classList.add("is-hint");
      button.setAttribute("aria-label", `${bus.color} bus pointing ${bus.direction}${free ? ", clear path" : ", blocked"}`);
      board.append(button);
    }
  };

  const render = () => {
    renderPassengers();
    renderParking();
    renderBoard();
    status.textContent = `${passengers.length} passengers · ${config.variant.parkingSlots - parked.length} parking spaces free`;
  };

  const settleParked = () => {
    let boarded = 0;
    while (passengers.length && parked.length) {
      const index = parked.findIndex((id) => byId.get(id)?.color === passengers[0]);
      if (index < 0) break;
      const [id] = parked.splice(index, 1);
      const bus = byId.get(id);
      const passengerColor = passengers.shift();
      boarded += 1;
      ctx.interact("bus_passenger_boarded", {
        bus_id: id,
        color: passengerColor,
        source: "parking",
        passengers_left: passengers.length,
      });
      ctx.tone(620 + boarded * 55, 0.025);
    }
    return boarded;
  };

  const maybeFinish = () => {
    if (passengers.length > 0) return false;
    ctx.haptic([8, 20, 8]);
    rt.finish("complete", {
      score: Math.max(500, 1450 + config.difficulty * 100 - blockedTaps * 45 - parkedUses * 20),
      detail: `${buses.length} buses escaped · ${blockedTaps} blocked taps`,
    });
    return true;
  };

  rt.on(board, "click", (event) => {
    if (busy || rt.isFinished()) return;
    const button = event.target.closest?.("[data-bus-id]");
    if (!button) return;
    const id = Number(button.dataset.busId);
    const bus = byId.get(id);
    if (!bus || !active.has(id)) return;

    const free = isFree(bus);
    ctx.interact("bus_tap", {
      bus_id: id,
      color: bus.color,
      direction: bus.direction,
      free,
      front_passenger: passengers[0] || null,
      parked: parked.length,
    });

    if (!free) {
      blockedTaps += 1;
      button.classList.remove("is-blocked");
      void button.offsetWidth;
      button.classList.add("is-blocked");
      ctx.interact("bus_blocked", { bus_id: id, direction: bus.direction, blocked_taps: blockedTaps });
      ctx.haptic(16);
      return;
    }

    busy = true;
    button.classList.add("is-exiting");
    ctx.interact("bus_exit", { bus_id: id, color: bus.color, direction: bus.direction });
    ctx.haptic(5);

    rt.later(() => {
      active.delete(id);
      const matchesFront = passengers[0] === bus.color;

      if (matchesFront) {
        const passengerColor = passengers.shift();
        ctx.interact("bus_passenger_boarded", {
          bus_id: id,
          color: passengerColor,
          source: "direct",
          passengers_left: passengers.length,
        });
        ctx.tone(680, 0.035);
      } else if (parked.length < config.variant.parkingSlots) {
        parked.push(id);
        parkedUses += 1;
        ctx.interact("bus_parked", {
          bus_id: id,
          color: bus.color,
          parked: parked.length,
          parking_slots: config.variant.parkingSlots,
        });
      } else {
        ctx.interact("bus_parking_overflow", {
          bus_id: id,
          color: bus.color,
          front_passenger: passengers[0] || null,
          parking_slots: config.variant.parkingSlots,
        });
        rt.finish("fail", {
          score: Math.max(0, (config.variant.passengers.length - passengers.length) * 130),
          detail: "Parking filled up",
        });
        return;
      }

      settleParked();
      busy = false;
      render();
      maybeFinish();
    }, 150);
  });

  render();
  return rt;
}

const definition = GAME_DEFINITIONS.find((game) => game.id === "bus-jam");
if (definition) {
  definition.title = "Bus Jam";
  definition.instruction = "Free buses in their arrow direction and match them to the passenger line";
  definition.createVariant = ({ random, difficulty }) => {
    const puzzle = createPuzzle(random, difficulty);
    return {
      accent: "#ff8a65",
      accent2: "#5b8cff",
      background: "#10131d",
      difficulty,
      ...puzzle,
    };
  };
  definition.mount = mountBusEscape;
  definition.__directionalEscapeV2 = true;
}
