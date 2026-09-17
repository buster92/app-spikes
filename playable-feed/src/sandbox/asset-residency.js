function spriteAssetIds(spec) {
  const ids = new Set();
  for (const entity of spec?.entities || []) {
    if (entity?.kind === "sprite" && typeof entity.asset === "string") ids.add(entity.asset);
  }
  for (const template of Object.values(spec?.templates || {})) {
    if (template?.kind === "sprite" && typeof template.asset === "string") ids.add(template.asset);
  }
  return ids;
}

export function referencedImageRefs(spec) {
  const byId = new Map((spec?.assets || []).map((asset) => [asset.id, asset]));
  const refs = new Set();
  for (const id of spriteAssetIds(spec)) {
    const asset = byId.get(id);
    if (asset?.kind === "image" && typeof asset.ref === "string") refs.add(asset.ref);
  }
  return [...refs];
}

export function createAssetResidencyController(loader, options = {}) {
  if (!loader?.preload || !loader?.releaseExcept) {
    throw new Error("Asset residency requires a trusted asset loader");
  }

  const maxPrefetchGames = Math.max(0, Math.min(2, Number(options.maxPrefetchGames ?? 1) || 0));
  let activeRefs = new Set();
  let generation = 0;

  async function activate(spec, { prefetch = [] } = {}) {
    const token = ++generation;
    const currentRefs = new Set(referencedImageRefs(spec));

    // Drop assets from older cards before resolving the new visible game. This
    // keeps a long social-feed session from accumulating decoded textures.
    loader.releaseExcept([...currentRefs]);
    const current = await loader.preload(spec);
    if (token !== generation) return { stale: true };

    const keep = new Set(currentRefs);
    const prefetched = [];
    const skipped = [];

    for (const candidate of (prefetch || []).slice(0, maxPrefetchGames)) {
      const candidateRefs = referencedImageRefs(candidate);
      try {
        const result = await loader.preload(candidate);
        if (token !== generation) return { stale: true };
        candidateRefs.forEach((ref) => keep.add(ref));
        prefetched.push({ gameId: candidate.id, ...result });
      } catch (error) {
        skipped.push({ gameId: candidate?.id || null, reason: error?.message || String(error) });
      }
    }

    if (token !== generation) return { stale: true };
    loader.releaseExcept([...keep]);
    activeRefs = keep;

    return {
      stale: false,
      gameId: spec?.id || null,
      current,
      prefetched,
      skipped,
      activeRefs: [...activeRefs],
      stats: loader.stats?.() || null,
    };
  }

  function cancelPending() {
    generation += 1;
  }

  function releaseAll() {
    generation += 1;
    activeRefs = new Set();
    loader.releaseExcept([]);
  }

  function stats() {
    return {
      activeRefs: [...activeRefs],
      loader: loader.stats?.() || null,
    };
  }

  return { activate, cancelPending, releaseAll, stats };
}
