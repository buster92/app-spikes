export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildDeck(definitions, { cycle = 0, sessionSeed = "session", difficulty = 1 } = {}) {
  if (!Array.isArray(definitions) || definitions.length === 0) return [];
  const deckSeed = hashString(`${sessionSeed}:${cycle}:deck`);
  const random = mulberry32(deckSeed);
  const ordered = shuffled(definitions, random);

  return ordered.map((definition, index) => {
    const variantSeed = hashString(`${sessionSeed}:${cycle}:${index}:${definition.id}`);
    const variantRandom = mulberry32(variantSeed);
    const variant = definition.createVariant({
      random: variantRandom,
      seed: variantSeed,
      cycle,
      difficulty: clamp(difficulty, 1, 5),
    });

    return {
      id: definition.id,
      title: definition.title,
      category: definition.category,
      instruction: definition.instruction,
      cycle,
      positionInCycle: index,
      difficulty: clamp(difficulty, 1, 5),
      variantSeed,
      variantId: `${definition.id}-c${cycle}-s${variantSeed.toString(36)}`,
      variant,
      mount: definition.mount,
    };
  });
}

export function nextDifficulty(current, recentOutcomes) {
  const difficulty = clamp(current, 1, 5);
  const lastThree = recentOutcomes.slice(-3);
  if (lastThree.length < 2) return difficulty;

  const successes = lastThree.filter((outcome) => outcome === "complete").length;
  const failures = lastThree.filter((outcome) => outcome === "fail").length;

  if (lastThree.length === 3 && successes === 3) return clamp(difficulty + 1, 1, 5);
  if (failures >= 2) return clamp(difficulty - 1, 1, 5);
  return difficulty;
}
