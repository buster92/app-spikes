import { GAME_DEFINITIONS } from "./games.js";

// Phone playtest pass: keep the directional Bus Jam rules from v2, but make
// cause/effect visible. A matching passenger now visibly boards before the bus
// leaves; parked buses also visibly consume the next matching passenger.

const COLORS = [
  { id: "coral", hex: "#ff6678" },
  { id: "gold", hex: "#ffd166" },
  { id: "mint", hex: "#45d9a5" },
  { id: "violet", hex: "#a66cff" },
];
const DELTAS = {
  up: [-1, 0],
  right: [0, 1],
  down: [1, 0],
  left: [0, -1],
};
const ARROWS = { up: "↑", right: "→", down: "↓", left: "←" };

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function pathIsClear(bus, buses, activeIds, size) {
  const [dr, dc] = DELTAS[bus.direction];
  let row = bus.row + dr;
  let col = bus.col + dc;
  while (row >= 0 && row < size && col >= 0 && col < size) {
    const blocker = buses.find((candidate) => (
      activeIds.has(candidate.id)
      && candidate.row === row
      && candidate.col === col
    ));
    if (blocker) return false;
    row += dr;
    col += dc;
  }
  return true;
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

function mountBusEscapeAnimated(host, config, ctx) {
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
  const colorName = (id) => String(id || "").toUpperCase();
  const isFree = (bus) => pathIsClear(bus, buses, active, config.variant.size);

  const renderPassengers = () => {
    passengerLine.replaceChildren();
    passengers.slice(0, 9).forEach((color, index) => {
      const person = node("div", `bus-escape-person${index === 0 ? " is-next" : ""}`);
      person.style.setProperty("--person-color", colorHex(color));
      person.dataset.passengerColor = color;
      person.setAttribute("aria-label", `${color} passenger${index === 0 ? ", next" : ""}`);
      passengerLine.append(person);
    });
  };

  const renderParking = () => {
    parking.replaceChildren();
    for (let index = 0; index < config.variant.parkingSlots; index += 1) {
      const id = parked[index];
      const slot = node("div", `bus-escape-slot${id !== undefined ? " is-filled" : ""}`);
      slot.dataset.parkingIndex = String(index);
      if (id !== undefined) {
        const bus = byId.get(id);
        slot.style.setProperty("--bus-color", colorHex(bus.color));
        slot.textContent = ARROWS[bus.direction];
        slot.setAttribute("aria-label", `${bus.color} bus waiting in parking`);
      }
      parking.append(slot);
    }
  };

  const renderBoard = () => {
    board.replaceChildren();
    for (const bus of buses) {
      if (!active.has(bus.id)) continue;
      const button = node("button", `bus-escape-bus dir-${bus.direction}`);
      button.type = "button";
      button.dataset.busId = String(bus.id);
      button.style.gridRow = String(bus.row + 1);
      button.style.gridColumn = String(bus.col + 1);
      button.style.setProperty("--bus-color", colorHex(bus.color));
      button.innerHTML = `<span class="bus-windows" aria-hidden="true"><i></i><i></i><i></i></span><strong>${ARROWS[bus.direction]}</strong>`;
      const free = isFree(bus);
      if (free) button.classList.add("is-free");
      if (config.difficulty <= 1 && free && bus.color === passengers[0]) button.classList.add("is-hint");
      button.setAttribute("aria-label", `${bus.color} bus pointing ${bus.direction}${free ? ", clear path" : ", blocked"}`);
      board.append(button);
    }
  };

  const defaultStatus = () => `${passengers.length} passengers · ${config.variant.parkingSlots - parked.length} parking spaces free`;

  const render = () => {
    renderPassengers();
    renderParking();
    renderBoard();
    status.textContent = defaultStatus();
    status.classList.remove("is-action");
  };

  const showAction = (message) => {
    status.textContent = message;
    status.classList.add("is-action");
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

  const settleParkedAnimated = (done) => {
    if (!passengers.length || !parked.length) {
      done();
      return;
    }

    const parkedIndex = parked.findIndex((id) => byId.get(id)?.color === passengers[0]);
    if (parkedIndex < 0) {
      done();
      return;
    }

    const id = parked[parkedIndex];
    const bus = byId.get(id);
    const passenger = passengerLine.querySelector(".bus-escape-person.is-next");
    const slot = parking.querySelector(`[data-parking-index="${parkedIndex}"]`);
    passenger?.classList.add("is-boarding");
    slot?.classList.add("is-serving");
    showAction(`${colorName(bus.color)} passenger boards the waiting bus`);
    ctx.interact("bus_boarding_animation_start", {
      bus_id: id,
      color: bus.color,
      source: "parking",
      passengers_left: passengers.length,
    });

    rt.later(() => {
      parked.splice(parkedIndex, 1);
      const passengerColor = passengers.shift();
      ctx.interact("bus_passenger_boarded", {
        bus_id: id,
        color: passengerColor,
        source: "parking",
        passengers_left: passengers.length,
      });
      ctx.tone(650, 0.035);
      ctx.haptic(5);
      render();
      rt.later(() => settleParkedAnimated(done), 90);
    }, 300);
  };

  rt.on(board, "click", (event) => {
    if (busy || rt.isFinished()) return;
    const button = event.target.closest?.("[data-bus-id]");
    if (!button) return;
    const id = Number(button.dataset.busId);
    const bus = byId.get(id);
    if (!bus || !active.has(id)) return;

    const free = isFree(bus);
    const matchesFront = passengers[0] === bus.color;
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
      showAction("Blocked — another bus is in the way");
      ctx.interact("bus_blocked", { bus_id: id, direction: bus.direction, blocked_taps: blockedTaps });
      ctx.haptic(16);
      rt.later(() => {
        status.textContent = defaultStatus();
        status.classList.remove("is-action");
      }, 550);
      return;
    }

    busy = true;
    ctx.interact("bus_exit", { bus_id: id, color: bus.color, direction: bus.direction, matches_front: matchesFront });
    ctx.haptic(5);

    if (matchesFront) {
      const passenger = passengerLine.querySelector(".bus-escape-person.is-next");
      passenger?.classList.add("is-boarding");
      button.classList.add("is-boarding-bus");
      showAction(`${colorName(bus.color)} passenger → ${colorName(bus.color)} bus`);
      ctx.interact("bus_boarding_animation_start", {
        bus_id: id,
        color: bus.color,
        source: "direct",
        passengers_left: passengers.length,
      });

      rt.later(() => {
        const passengerColor = passengers.shift();
        ctx.interact("bus_passenger_boarded", {
          bus_id: id,
          color: passengerColor,
          source: "direct",
          passengers_left: passengers.length,
        });
        ctx.tone(680, 0.04);
        button.classList.remove("is-boarding-bus");
        button.classList.add("is-exiting");
        showAction(`${colorName(bus.color)} bus departs`);

        rt.later(() => {
          active.delete(id);
          render();
          settleParkedAnimated(() => {
            busy = false;
            render();
            maybeFinish();
          });
        }, 250);
      }, 300);
      return;
    }

    if (parked.length >= config.variant.parkingSlots) {
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

    button.classList.add("is-parking");
    showAction(`${colorName(bus.color)} bus waits in parking`);
    ctx.interact("bus_parking_animation_start", {
      bus_id: id,
      color: bus.color,
      parked: parked.length,
      parking_slots: config.variant.parkingSlots,
    });

    rt.later(() => {
      active.delete(id);
      parked.push(id);
      parkedUses += 1;
      ctx.interact("bus_parked", {
        bus_id: id,
        color: bus.color,
        parked: parked.length,
        parking_slots: config.variant.parkingSlots,
      });
      render();
      busy = false;
    }, 260);
  });

  render();
  return rt;
}

const definition = GAME_DEFINITIONS.find((game) => game.id === "bus-jam");
if (definition?.__directionalEscapeV2) {
  definition.mount = mountBusEscapeAnimated;
  definition.__boardingFeedbackV3 = true;
}
