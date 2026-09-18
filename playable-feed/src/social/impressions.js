export class QualifiedImpressionTracker {
  constructor({ onImpression, threshold = 0.5, dwellMs = 350, schedule = setTimeout, cancel = clearTimeout } = {}) {
    if (typeof onImpression !== "function") throw new TypeError("onImpression is required");
    this.onImpression = onImpression;
    this.threshold = threshold;
    this.dwellMs = dwellMs;
    this.schedule = schedule;
    this.cancel = cancel;
    this.logged = new Set();
    this.pending = new Map();
  }

  update({ postId, ratio, metadata }) {
    if (!postId || this.logged.has(postId)) return;
    if (ratio < this.threshold) {
      this.#cancel(postId);
      return;
    }
    if (this.pending.has(postId)) return;
    const token = this.schedule(() => {
      const pending = this.pending.get(postId);
      if (!pending || this.logged.has(postId)) return;
      this.pending.delete(postId);
      this.logged.add(postId);
      this.onImpression(pending.metadata);
    }, this.dwellMs);
    this.pending.set(postId, { token, metadata });
  }

  #cancel(postId) {
    const pending = this.pending.get(postId);
    if (pending) this.cancel(pending.token);
    this.pending.delete(postId);
  }

  resetVisible() {
    for (const postId of this.pending.keys()) this.#cancel(postId);
  }

  dispose() { this.resetVisible(); }
}

function metadataFor(element) {
  return {
    post_id: element.dataset.postId,
    game_id: element.dataset.gameId,
    presentation: element.dataset.presentation,
    surface: element.dataset.surface,
  };
}

export function observePostImpressions({ root, tracker, Observer = globalThis.IntersectionObserver } = {}) {
  const cards = [...root.querySelectorAll("[data-post-id][data-game-id]")];
  tracker.resetVisible();
  if (typeof Observer === "function") {
    const observer = new Observer((entries) => {
      for (const entry of entries) tracker.update({ postId: entry.target.dataset.postId, ratio: entry.intersectionRatio, metadata: metadataFor(entry.target) });
    }, { threshold: [0, tracker.threshold, 1] });
    cards.forEach((card) => observer.observe(card));
    return () => { observer.disconnect(); tracker.resetVisible(); };
  }

  let frame = null;
  const evaluate = () => {
    frame = null;
    const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight || 0;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const ratio = rect.height > 0 ? visible / rect.height : 0;
      tracker.update({ postId: card.dataset.postId, ratio, metadata: metadataFor(card) });
    }
  };
  const requestEvaluation = () => { if (frame === null) frame = requestAnimationFrame(evaluate); };
  addEventListener("scroll", requestEvaluation, { passive: true });
  addEventListener("resize", requestEvaluation);
  requestEvaluation();
  return () => {
    removeEventListener("scroll", requestEvaluation);
    removeEventListener("resize", requestEvaluation);
    if (frame !== null) cancelAnimationFrame(frame);
    tracker.resetVisible();
  };
}
