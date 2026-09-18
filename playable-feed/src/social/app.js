import { Analytics } from "../analytics.js";
import { BUNDLED_PLAYABLES, bundledPlayable } from "./catalog.js";
import { CurrentActorProvider, LocalSocialRepository } from "./repository.js";
import { SocialService } from "./service.js";
import { challengePresentation, postPresentation, publishValidation, resultPresentation } from "./presentation.js";
import { PlayableHost } from "./playable-host.js";
import { compareResults, formatMetric } from "./domain.js";

const analytics = new Analytics();
const repository = new LocalSocialRepository();
const actorProvider = new CurrentActorProvider(repository);
const service = new SocialService({ repository, actorProvider, analytics });
const playableHost = new PlayableHost();
const presentationMode = new URLSearchParams(location.search).get("presentation") === "anonymous" ? "anonymous" : "creator";
const impressedPosts = new Set();
let loggedFeedScope = null;
const ui = { view: "discover", profileId: null, selectedGameId: BUNDLED_PLAYABLES[0].id, benchmarkResultId: null, error: null, play: null };

document.body.classList.add("social-mode");
const root = document.createElement("div");
root.id = "socialRoot";
root.className = "social-shell";
document.body.prepend(root);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const state = () => service.state();
const profile = (id) => state().profiles.find((item) => item.id === id);
const result = (id) => state().results.find((item) => item.id === id);
const post = (id) => state().posts.find((item) => item.id === id);

function nav() {
  return `<header class="social-header"><div class="social-brand"><span>P</span> PLAYLOOP</div><a class="legacy-link" href="?legacy=1">Classic playtest</a></header>
    <nav class="social-tabs" aria-label="Social feed"><button class="social-tab" data-view="discover" aria-current="${ui.view === "discover"}">Discover</button><button class="social-tab" data-view="following" aria-current="${ui.view === "following"}">Following</button><button class="social-tab" data-view="challenges" aria-current="${ui.view === "challenges"}">Challenges</button><button class="social-tab" data-view="profile" data-profile="${service.actorId()}" aria-current="${ui.view === "profile"}">Profile</button><button class="social-tab create" data-view="create" aria-current="${ui.view === "create"}">＋ Create</button></nav>`;
}

function postCard(item) {
  const creator = profile(item.creatorId);
  const benchmark = result(item.creatorResultId);
  const playable = bundledPlayable(item.playableRef.gameId);
  const view = postPresentation({ post: item, creator, benchmark, liked: service.isLiked(item.id), following: creator.isLocal ? false : service.isFollowing(creator.id) });
  if (!impressedPosts.has(item.id)) {
    impressedPosts.add(item.id);
    analytics.log("social_post_impression", { post_id: item.id, game_id: item.playableRef.gameId, presentation: presentationMode });
  }
  return `<article class="post-card" data-post-id="${item.id}">
    ${presentationMode === "creator" ? `<div class="post-head"><button class="link-button avatar" data-profile="${creator.id}" aria-label="Open ${escapeHtml(creator.displayName)} profile">${escapeHtml(creator.avatar)}</button><button class="link-button creator-copy" data-profile="${creator.id}"><strong>${escapeHtml(view.creatorName)} ${creator.badge ? `<small>· ${escapeHtml(creator.badge)}</small>` : ""}</strong><span>${escapeHtml(view.creatorLabel)}</span></button>${view.canFollow ? `<button class="follow-button" data-follow="${creator.id}" aria-pressed="${view.following}">${view.following ? "Following" : "Follow"}</button>` : ""}</div><p class="post-caption">“${escapeHtml(view.caption)}”</p>` : `<div class="post-head"><div class="creator-copy"><strong>Playable</strong><span>Plain presentation · same game package</span></div></div>`}
    <div class="playable-cover" aria-label="${escapeHtml(playable?.title || item.playableRef.gameId)} preview"><span class="cover-emoji">${escapeHtml(playable?.cover || "🎮")}</span><h2>${escapeHtml(playable?.title || item.playableRef.gameId)}</h2><p>${escapeHtml(view.challengeLabel)} · same version and seed</p><button class="social-button primary" data-play="${item.id}">Play challenge</button></div>
    <div class="post-actions"><button class="social-button" data-like="${item.id}" aria-pressed="${view.liked}">${view.liked ? "♥ Liked" : "♡ Like"}</button><button class="social-button" data-play="${item.id}">▶ ${escapeHtml(view.benchmarkLabel)}</button></div>
  </article>`;
}

function feedView(scope) {
  const posts = service.feed(scope);
  if (loggedFeedScope !== scope) {
    analytics.log("social_feed_scope_changed", { scope, previous_scope: loggedFeedScope });
    loggedFeedScope = scope;
  }
  return posts.length ? `<section class="social-feed">${posts.map(postCard).join("")}</section>` : `<div class="social-panel empty-state"><h2>No posts here yet</h2><p>Follow a creator in Discover and their posts will appear immediately.</p><button class="social-button primary" data-view="discover">Explore creators</button></div>`;
}

function profileView(profileId) {
  const view = service.profile(profileId);
  const canFollow = profileId !== service.actorId();
  return `<section class="social-panel profile-hero"><div class="avatar">${escapeHtml(view.profile.avatar)}</div><h1>${escapeHtml(view.profile.displayName)}</h1><p>@${escapeHtml(view.profile.handle)}${view.profile.badge ? ` · ${escapeHtml(view.profile.badge)}` : ""}</p><p>${escapeHtml(view.profile.bio || "")}</p><div class="profile-stats"><span><strong>${view.posts.length}</strong>posts</span><span><strong>${view.followers}</strong>followers</span></div>${canFollow ? `<p><button class="social-button primary" data-follow="${profileId}">${view.following ? "Following" : "Follow"}</button></p>` : ""}</section><section class="social-feed" style="margin-top:16px">${view.posts.length ? view.posts.map(postCard).join("") : `<div class="empty-state">No published challenges yet.</div>`}</section>`;
}

function challengesView() {
  const items = service.challenges();
  if (!items.length) return `<div class="social-panel empty-state"><h2>No challenges yet</h2><p>Finish a creator post and challenge them back.</p></div>`;
  return `<section class="social-feed">${items.map((item) => {
    const source = post(item.sourcePostId); const challenger = profile(item.challengerId); const target = item.targetActorId ? profile(item.targetActorId) : null;
    const challengerResult = result(item.challengerResultId); const responseResult = result(item.responseResultId);
    const comparison = responseResult ? compareResults(source.resultPolicy, responseResult, challengerResult) : null;
    const view = challengePresentation({ challenge: item, challenger, target, challengerResult, responseResult, policy: source.resultPolicy, comparison });
    return `<article class="challenge-card"><strong>${escapeHtml(view.title)}</strong><p>${escapeHtml(view.status)}${view.response ? ` · response ${escapeHtml(view.response)}` : ""}</p><small>${escapeHtml(bundledPlayable(item.playableRef.gameId)?.title)} · local/trusted-shell result</small><p><button class="social-button ${view.canPlay ? "primary" : ""}" data-challenge="${item.id}">${view.canPlay ? "Play exact challenge" : "View outcome"}</button></p></article>`;
  }).join("")}</section>`;
}

function createView() {
  const selected = bundledPlayable(ui.selectedGameId);
  const validation = publishValidation({ gameId: ui.selectedGameId, caption: document.querySelector?.("#publishCaption")?.value || "placeholder", benchmarkResultId: ui.benchmarkResultId });
  return `<section class="social-panel"><div class="create-form"><p class="eyebrow">CREATE A PLAYABLE POST</p><h1>Set a challenge</h1><p>Choose a reviewed bundled playable. The game stays declarative; your caption and social actions remain in Playloop.</p></div><div class="create-grid">${BUNDLED_PLAYABLES.map((item) => `<button class="playable-choice ${item.id === ui.selectedGameId ? "selected" : ""}" data-select-game="${item.id}"><span>${item.cover}</span>${escapeHtml(item.title)}</button>`).join("")}</div><div class="create-form"><button class="social-button primary" data-preview-publish="${selected.id}">${ui.benchmarkResultId ? "Replay benchmark" : "Play to set benchmark"}</button><p class="form-status">${ui.benchmarkResultId ? "✓ Benchmark completed and stored locally" : "Your score must come from an actual completed run."}</p><label for="publishCaption"><strong>Challenge caption</strong></label><textarea id="publishCaption" maxlength="180" placeholder="Nobody gets over 40 on this."></textarea><p class="form-status" id="publishStatus">${validation.errors.filter((error) => !error.includes("caption")).map(escapeHtml).join(" · ")}</p><button class="social-button primary" data-publish>Publish post</button></div></section>`;
}

function render() {
  let content;
  try {
    if (ui.view === "discover" || ui.view === "following") content = feedView(ui.view);
    else if (ui.view === "profile") content = profileView(ui.profileId || service.actorId());
    else if (ui.view === "challenges") content = challengesView();
    else content = createView();
  } catch (error) {
    content = `<div class="social-panel empty-state"><h2>Could not load this view</h2><p>${escapeHtml(error.message)}</p><button class="social-button" data-view="discover">Back to Discover</button></div>`;
  }
  root.innerHTML = `${nav()}${repository.recovered ? `<div class="error-banner" role="status">Damaged local social data was reset safely.</div>` : ""}${ui.error ? `<div class="error-banner" role="alert">${escapeHtml(ui.error)}</div>` : ""}${content}${ui.play ? modalView() : ""}`;
  if (ui.play) document.querySelector("[data-close-play]")?.focus();
  if (ui.play?.mountPending) mountActivePlayable();
}

function modalView() {
  const play = ui.play; const source = post(play.postId); const creator = profile(source.creatorId); const playable = bundledPlayable(source.playableRef.gameId);
  if (!play.finished) return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Play ${escapeHtml(playable.title)}"><section class="play-modal"><div class="modal-head"><div><small>${play.mode === "challenge" ? "EXACT CHALLENGE" : "PLAYABLE POST"}</small><h2>${escapeHtml(playable.title)}</h2></div><button class="modal-close" data-close-play aria-label="Close playable">×</button></div><p id="playStatus">Loading exact version and seed…</p><canvas id="socialCanvas" class="game-canvas" aria-label="${escapeHtml(playable.title)} game"></canvas></section></div>`;
  const view = resultPresentation({ post: source, creator, playerResult: play.result, benchmark: result(source.creatorResultId), comparison: play.comparison });
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Play result"><section class="play-modal"><div class="modal-head"><h2>Result</h2><button class="modal-close" data-close-play aria-label="Close result">×</button></div><div class="result-panel"><h2>${escapeHtml(play.mode === "challenge" && play.challengeComparison ? `Challenge: ${play.challengeComparison.outcome}` : view.headline)}</h2><div class="result-metrics"><span>${escapeHtml(view.playerLabel)}</span>${view.benchmarkLabel ? `<span>${escapeHtml(view.benchmarkLabel)}</span>` : ""}</div><p class="persistence-note">Stored as trusted-shell local, not server-verified.</p><div class="result-buttons">${play.mode !== "challenge" ? `<button class="social-button" data-retry-play>Retry</button>` : ""}${view.canChallenge && play.mode === "post" ? `<button class="social-button" data-create-challenge>Challenge</button>` : ""}${creator.id !== service.actorId() ? `<button class="social-button" data-follow="${creator.id}">${service.isFollowing(creator.id) ? "Following" : "Follow"}</button>` : ""}<button class="social-button" data-like="${source.id}">${service.isLiked(source.id) ? "♥ Liked" : "♡ Like"}</button><button class="social-button primary" data-continue>Continue</button></div></div></section></div>`;
}

async function mountActivePlayable() {
  const play = ui.play; play.mountPending = false;
  const canvas = document.querySelector("#socialCanvas"); const status = document.querySelector("#playStatus");
  if (!canvas || !play) return;
  const source = post(play.postId);
  try {
    analytics.log("social_post_play_started", { post_id: source.id, game_id: source.playableRef.gameId, runtime: source.playableRef.runtime, source: play.mode });
    await playableHost.mount(canvas, source.playableRef, source.resultPolicy, {
      onError: (error) => { if (status) status.textContent = `Runtime error: ${error.message}`; },
      onFinish: (normalized, snapshot) => finishPlay(normalized, snapshot),
    });
    if (status) status.textContent = source.caption;
  } catch (error) {
    if (status) status.textContent = `Playable unavailable: ${error.message}`;
  }
}

function finishPlay(normalized, snapshot) {
  if (!ui.play || ui.play.finished) return;
  try {
    const play = ui.play; const source = post(play.postId);
    const actorId = play.mode === "challenge" ? play.responseActorId : service.actorId();
    const saved = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: normalized.status, metric: normalized.metric, actorId, replayEvidence: { kind: "local_snapshot", elapsedMs: Math.round(snapshot?.elapsedMs || 0) } });
    play.result = saved.result; play.finished = true; play.comparison = service.comparisonFor(source.id, saved.result.id);
    if (play.mode === "publish" && saved.result.status === "completed") ui.benchmarkResultId = saved.result.id;
    if (play.mode === "challenge" && saved.result.status === "completed") play.challengeComparison = service.completeChallenge(play.challengeId, saved.result.id).comparison;
  } catch (error) { ui.error = error.message; ui.play = null; }
  render();
}

function startPost(postId, mode = "post", challenge = null) {
  playableHost.destroy();
  const source = service.post(postId);
  const responseActorId = challenge ? (challenge.targetActorId || service.actorId()) : service.actorId();
  ui.play = { postId: source.id, mode, challengeId: challenge?.id || null, responseActorId, finished: false, result: null, comparison: null, mountPending: true };
  render();
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("button"); if (!button) return;
  try {
    ui.error = null;
    if (button.dataset.view) { ui.view = button.dataset.view; ui.profileId = button.dataset.profile || null; ui.play = null; playableHost.destroy(); render(); return; }
    if (button.dataset.profile) { ui.view = "profile"; ui.profileId = button.dataset.profile; render(); return; }
    if (button.dataset.follow) { service.setFollow(button.dataset.follow, !service.isFollowing(button.dataset.follow)); render(); return; }
    if (button.dataset.like) { service.setLike(button.dataset.like, !service.isLiked(button.dataset.like)); render(); return; }
    if (button.dataset.play) { startPost(button.dataset.play); return; }
    if (button.dataset.selectGame) { ui.selectedGameId = button.dataset.selectGame; ui.benchmarkResultId = null; render(); return; }
    if (button.dataset.previewPublish) {
      const source = state().posts.find((item) => item.playableRef.gameId === button.dataset.previewPublish);
      if (!source) throw new Error("This approved playable has no local publication fixture");
      startPost(source.id, "publish"); return;
    }
    if (button.dataset.publish !== undefined) {
      const caption = document.querySelector("#publishCaption")?.value || "";
      const validation = publishValidation({ gameId: ui.selectedGameId, caption, benchmarkResultId: ui.benchmarkResultId });
      if (!validation.valid) { document.querySelector("#publishStatus").textContent = validation.errors.join(" · "); return; }
      const published = service.publish({ gameId: ui.selectedGameId, caption, benchmarkResultId: ui.benchmarkResultId });
      ui.benchmarkResultId = null; ui.view = "profile"; ui.profileId = service.actorId(); ui.error = published.persisted ? null : "Post is available for this session, but local persistence failed."; render(); return;
    }
    if (button.dataset.challenge) {
      const challenge = service.openChallenge(button.dataset.challenge);
      if (challenge.state === "open") startPost(challenge.sourcePostId, "challenge", challenge);
      return;
    }
    if (button.dataset.closePlay !== undefined || button.dataset.continue !== undefined) { playableHost.destroy(); ui.play = null; render(); return; }
    if (button.dataset.retryPlay !== undefined) { const { postId, mode, challengeId } = ui.play; const challenge = challengeId ? service.openChallenge(challengeId) : null; startPost(postId, mode, challenge); return; }
    if (button.dataset.createChallenge !== undefined) {
      const target = post(ui.play.postId).creatorId === service.actorId() ? null : post(ui.play.postId).creatorId;
      service.createChallenge({ postId: ui.play.postId, resultId: ui.play.result.id, targetActorId: target }); ui.view = "challenges"; ui.play = null; render();
    }
  } catch (error) { ui.error = error.message; render(); }
});

window.addEventListener("pagehide", () => playableHost.destroy(), { once: true });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui.play) {
    playableHost.destroy();
    ui.play = null;
    render();
  }
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
analytics.log("app_ready", { surface: "social_v0", persistence_recovered: repository.recovered });
render();
