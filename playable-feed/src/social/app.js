import { Analytics } from "../analytics.js";
import { BUNDLED_PLAYABLES, bundledPlayable, playableRefFor } from "./catalog.js";
import { CurrentActorProvider, LocalSocialRepository } from "./repository.js";
import { SocialService } from "./service.js";
import { challengeOutcomePresentation, challengePresentation, nextPersistenceWarning, persistencePresentation, postPresentation, publishValidation, resultPresentation, verificationLabel } from "./presentation.js";
import { PlayableHost } from "./playable-host.js";
import { compareResults } from "./domain.js";
import { observePostImpressions, QualifiedImpressionTracker, shouldObservePostImpressions } from "./impressions.js";
import { isActiveMountedPlay, isActivePlayRequest, mountFailureReason, socialEventProperties } from "./play-lifecycle.js";

const analytics = new Analytics();
const repository = new LocalSocialRepository();
const actorProvider = new CurrentActorProvider(repository);
const service = new SocialService({ repository, actorProvider, analytics });
const playableHost = new PlayableHost();
const presentationMode = new URLSearchParams(location.search).get("presentation") === "anonymous" ? "anonymous" : "creator";
let loggedFeedScope = null;
const loggedSurfaces = new Set();
const impressionTracker = new QualifiedImpressionTracker({ onImpression: (metadata) => analytics.log("social_post_impression", socialEventProperties(presentationMode, metadata)) });
let stopImpressionObserver = () => {};
const ui = { view: "discover", profileId: null, selectedGameId: BUNDLED_PLAYABLES[0].id, publishCaption: "", benchmarkAttempt: null, error: null, persistenceWarning: repository.persistenceAvailable ? null : persistencePresentation(false, "social activity").warning, play: null, outcomeChallengeId: null };

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
  if (presentationMode === "anonymous") return `<header class="social-header"><div class="social-brand"><span>P</span> PLAYLOOP</div><a class="legacy-link" href="?legacy=1">Classic playtest</a></header><nav class="social-tabs" aria-label="Playable feed"><button class="social-tab" data-view="discover" aria-current="true">Discover</button></nav>`;
  return `<header class="social-header"><div class="social-brand"><span>P</span> PLAYLOOP</div><a class="legacy-link" href="?legacy=1">Classic playtest</a></header>
    <nav class="social-tabs" aria-label="Social feed"><button class="social-tab" data-view="discover" aria-current="${ui.view === "discover"}">Discover</button><button class="social-tab" data-view="following" aria-current="${ui.view === "following"}">Following</button><button class="social-tab" data-view="challenges" aria-current="${ui.view === "challenges"}">Challenges</button><button class="social-tab" data-view="profile" data-profile="${service.actorId()}" aria-current="${ui.view === "profile"}">Profile</button><button class="social-tab create" data-view="create" aria-current="${ui.view === "create"}">＋ Create</button></nav>`;
}

function postCard(item, surface) {
  const creator = profile(item.creatorId);
  const benchmark = result(item.creatorResultId);
  const playable = bundledPlayable(item.playableRef.gameId);
  if (!creator || !playable) return `<article class="post-card"><h2>Playable unavailable</h2><p>This post cannot be displayed safely right now.</p></article>`;
  const view = postPresentation({ post: item, creator, benchmark, liked: service.isLiked(item.id), following: creator.isLocal ? false : service.isFollowing(creator.id), mode: presentationMode });
  return `<article class="post-card" data-post-id="${item.id}" data-game-id="${item.playableRef.gameId}" data-presentation="${presentationMode}" data-surface="${surface}">
    ${presentationMode === "creator" ? `<div class="post-head"><button class="link-button avatar" data-profile="${creator.id}" aria-label="Open ${escapeHtml(creator.displayName)} profile">${escapeHtml(creator.avatar)}</button><button class="link-button creator-copy" data-profile="${creator.id}"><strong>${escapeHtml(view.creatorName)} ${creator.badge ? `<small>· ${escapeHtml(creator.badge)}</small>` : ""}</strong><span>${escapeHtml(view.creatorLabel)}</span></button>${view.canFollow ? `<button class="follow-button" data-follow="${creator.id}" aria-pressed="${view.following}">${view.following ? "Following" : "Follow"}</button>` : ""}</div><p class="post-caption">“${escapeHtml(view.caption)}”</p>` : `<div class="post-head"><div class="creator-copy"><strong>Playable</strong><span>Plain presentation · same game package</span></div></div>`}
    <div class="playable-cover" aria-label="${escapeHtml(playable.title)} preview"><span class="cover-emoji">${escapeHtml(playable.cover || "🎮")}</span><h2>${escapeHtml(playable.title)}</h2><p>${escapeHtml(view.challengeLabel)} · same version and seed</p><button class="social-button primary" data-play="${item.id}">${presentationMode === "creator" ? "Play challenge" : "Play"}</button></div>
    ${view.showSocialActions ? `<div class="post-actions"><button class="social-button" data-like="${item.id}" aria-pressed="${view.liked}">${view.liked ? "♥ Liked" : "♡ Like"}</button><button class="social-button" data-play="${item.id}">▶ ${escapeHtml(view.benchmarkLabel)}</button></div>` : ""}
  </article>`;
}

function feedView(scope) {
  const posts = service.feed(scope);
  if (loggedFeedScope !== scope) {
    analytics.log("social_feed_scope_changed", socialEventProperties(presentationMode, { scope, previous_scope: loggedFeedScope }));
    loggedFeedScope = scope;
  }
  const key = `feed:${scope}`;
  if (!loggedSurfaces.has(key)) { loggedSurfaces.add(key); analytics.log("social_feed_viewed", socialEventProperties(presentationMode, { scope, post_count: posts.length })); }
  return posts.length ? `<section class="social-feed">${posts.map((item) => postCard(item, scope)).join("")}</section>` : `<div class="social-panel empty-state"><h2>No posts here yet</h2><p>Follow a creator in Discover and their posts will appear immediately.</p><button class="social-button primary" data-view="discover">Explore creators</button></div>`;
}

function profileView(profileId) {
  const view = service.profile(profileId);
  const key = `profile:${profileId}`;
  if (!loggedSurfaces.has(key)) { loggedSurfaces.add(key); analytics.log("social_profile_opened", socialEventProperties(presentationMode, { profile_id: profileId, is_self: profileId === service.actorId() })); }
  const canFollow = profileId !== service.actorId();
  return `<section class="social-panel profile-hero"><div class="avatar">${escapeHtml(view.profile.avatar)}</div><h1>${escapeHtml(view.profile.displayName)}</h1><p>@${escapeHtml(view.profile.handle)}${view.profile.badge ? ` · ${escapeHtml(view.profile.badge)}` : ""}</p><p>${escapeHtml(view.profile.bio || "")}</p><div class="profile-stats"><span><strong>${view.posts.length}</strong>posts</span><span><strong>${view.followers}</strong>followers</span></div>${canFollow ? `<p><button class="social-button primary" data-follow="${profileId}">${view.following ? "Following" : "Follow"}</button></p>` : ""}</section><section class="social-feed" style="margin-top:16px">${view.posts.length ? view.posts.map((item) => postCard(item, "profile")).join("") : `<div class="empty-state">No published challenges yet.</div>`}</section>`;
}

function challengesView() {
  const items = service.challenges();
  if (!items.length) return `<div class="social-panel empty-state"><h2>No challenges yet</h2><p>Finish a creator post and challenge them back.</p></div>`;
  return `<section class="social-feed">${items.map((item) => {
    const source = post(item.sourcePostId); const challenger = profile(item.challengerId); const target = item.targetActorId ? profile(item.targetActorId) : null;
    const challengerResult = result(item.challengerResultId); const responseResult = result(item.responseResultId);
    const comparison = responseResult ? compareResults(source.resultPolicy, responseResult, challengerResult) : null;
    const capabilities = service.challengeCapabilities(item);
    const view = challengePresentation({ challenge: item, challenger, target, challengerResult, responseResult, policy: source.resultPolicy, comparison, capabilities });
    const action = capabilities.canRespond ? `<p><button class="social-button primary" data-challenge="${item.id}">Play exact challenge</button></p>`
      : view.canViewOutcome ? `<p><button class="social-button" data-challenge="${item.id}">View outcome</button></p>`
        : capabilities.canCancel ? `<p><button class="social-button" data-cancel-challenge="${item.id}">Cancel challenge</button></p>` : "";
    return `<article class="challenge-card"><strong>${escapeHtml(view.title)}</strong><p>${escapeHtml(view.status)}${view.response ? ` · response ${escapeHtml(view.response)}` : ""}</p><small>${escapeHtml(bundledPlayable(item.playableRef.gameId)?.title || item.playableRef.gameId)} · ${escapeHtml(verificationLabel(challengerResult))}</small>${action}</article>`;
  }).join("")}</section>`;
}

function createView() {
  const selected = bundledPlayable(ui.selectedGameId);
  const validation = publishValidation({ gameId: ui.selectedGameId, caption: ui.publishCaption || "placeholder", benchmarkAttempt: ui.benchmarkAttempt });
  const benchmarkCopy = ui.benchmarkAttempt ? "✓ Benchmark ready to publish" : "Your score must come from an actual completed run.";
  return `<section class="social-panel"><div class="create-form"><p class="eyebrow">CREATE A PLAYABLE POST</p><h1>Set a challenge</h1><p>Choose a reviewed bundled playable. The game stays declarative; your caption and social actions remain in Playloop.</p></div><div class="create-grid">${BUNDLED_PLAYABLES.map((item) => `<button class="playable-choice ${item.id === ui.selectedGameId ? "selected" : ""}" data-select-game="${item.id}"><span>${item.cover}</span>${escapeHtml(item.title)}</button>`).join("")}</div><div class="create-form"><button class="social-button primary" data-preview-publish="${selected.id}">${ui.benchmarkAttempt ? "Replay benchmark" : "Play to set benchmark"}</button><p class="form-status">${escapeHtml(benchmarkCopy)}</p><label for="publishCaption"><strong>Challenge caption</strong></label><textarea id="publishCaption" maxlength="180" placeholder="Nobody gets over 40 on this.">${escapeHtml(ui.publishCaption)}</textarea><p class="form-status" id="publishStatus">${validation.errors.filter((error) => !error.includes("caption")).map(escapeHtml).join(" · ")}</p><button class="social-button primary" data-publish>Publish post</button></div></section>`;
}

function outcomeModal() {
  const challenge = state().challenges.find((item) => item.id === ui.outcomeChallengeId);
  if (!challenge?.responseResultId) return "";
  const source = post(challenge.sourcePostId); const challengerResult = result(challenge.challengerResultId); const responseResult = result(challenge.responseResultId);
  const challenger = profile(challenge.challengerId); const responder = profile(responseResult.actorId);
  const comparison = compareResults(source.resultPolicy, responseResult, challengerResult);
  const view = challengeOutcomePresentation({ challenger, responder, challengerResult, responseResult, policy: source.resultPolicy, comparison, playableTitle: bundledPlayable(source.playableRef.gameId)?.title || source.playableRef.gameId });
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="challengeOutcomeTitle"><section class="play-modal"><div class="modal-head"><h2 id="challengeOutcomeTitle">${escapeHtml(view.title)}</h2><button class="modal-close" data-close-outcome aria-label="Close challenge outcome">×</button></div><div class="result-panel"><h2>${escapeHtml(view.outcome)}</h2><div class="result-metrics"><span>${escapeHtml(view.challengerLabel)}</span><span>${escapeHtml(view.responderLabel)}</span></div><p class="persistence-note">${escapeHtml(view.verification)}</p><p>Exact game version and seed: ${escapeHtml(source.playableRef.gameId)} · ${escapeHtml(source.playableRef.specRef.slice(0, 12))}… · seed ${source.playableRef.seed}</p><button class="social-button primary" data-close-outcome>Continue</button></div></section></div>`;
}

function render() {
  stopImpressionObserver();
  let content;
  try {
    if (ui.view === "discover" || ui.view === "following") content = feedView(ui.view);
    else if (ui.view === "profile") content = profileView(ui.profileId || service.actorId());
    else if (ui.view === "challenges") content = challengesView();
    else content = createView();
  } catch (error) {
    playableHost.destroy();
    content = `<div class="social-panel empty-state"><h2>Could not load this view</h2><p>${escapeHtml(error.message)}</p><button class="social-button" data-view="discover">Back to Discover</button></div>`;
  }
  root.innerHTML = `${nav()}${repository.recovered ? `<div class="error-banner" role="status">Damaged local social data was reset safely.</div>` : ""}${ui.persistenceWarning ? `<div class="error-banner" role="status">${escapeHtml(ui.persistenceWarning)}</div>` : ""}${ui.error ? `<div class="error-banner" role="alert">${escapeHtml(ui.error)}</div>` : ""}${content}${ui.play ? modalView() : ""}${ui.outcomeChallengeId ? outcomeModal() : ""}`;
  stopImpressionObserver = shouldObservePostImpressions({ hasPlayModal: Boolean(ui.play), hasOutcomeModal: Boolean(ui.outcomeChallengeId) }) ? observePostImpressions({ root, tracker: impressionTracker }) : (() => {});
  if (ui.outcomeChallengeId) document.querySelector("[data-close-outcome]")?.focus();
  else if (ui.play) document.querySelector("[data-close-play]")?.focus();
  if (ui.play?.mountPending) mountActivePlayable();
}

function modalView() {
  const play = ui.play; const source = play.postId ? post(play.postId) : play.source; const creator = source.creatorId ? profile(source.creatorId) : null; const playable = bundledPlayable(source.playableRef.gameId);
  if (!playable) return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Playable unavailable"><section class="play-modal"><div class="modal-head"><h2>Playable unavailable</h2><button class="modal-close" data-close-play aria-label="Close playable error">×</button></div><p>This exact playable package is not available on this device.</p></section></div>`;
  if (!play.finished) return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Play ${escapeHtml(playable.title)}"><section class="play-modal"><div class="modal-head"><div><small>${play.mode === "challenge" ? "EXACT CHALLENGE" : "PLAYABLE POST"}</small><h2>${escapeHtml(playable.title)}</h2></div><button class="modal-close" data-close-play aria-label="Close playable">×</button></div><p id="playStatus">Loading exact version and seed…</p><canvas id="socialCanvas" class="game-canvas" aria-label="${escapeHtml(playable.title)} game"></canvas></section></div>`;
  if (!play.postId) return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Benchmark result"><section class="play-modal"><div class="modal-head"><h2>Benchmark ready</h2><button class="modal-close" data-close-play aria-label="Close benchmark result">×</button></div><div class="result-panel"><p>${escapeHtml(play.result?.metric === null ? "Finish the playable to establish a benchmark." : "Use this completed run when you publish.")}</p><button class="social-button primary" data-continue>Continue</button></div></section></div>`;
  const view = resultPresentation({ post: source, creator, playerResult: play.result, benchmark: result(source.creatorResultId), comparison: play.comparison, mode: presentationMode, persisted: play.persisted });
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Play result"><section class="play-modal"><div class="modal-head"><h2>Result</h2><button class="modal-close" data-close-play aria-label="Close result">×</button></div><div class="result-panel"><h2>${escapeHtml(play.mode === "challenge" && play.challengeComparison ? `Challenge: ${play.challengeComparison.outcome}` : view.headline)}</h2><div class="result-metrics"><span>${escapeHtml(view.playerLabel)}</span>${view.benchmarkLabel ? `<span>${escapeHtml(view.benchmarkLabel)}</span>` : ""}</div><p class="persistence-note">${escapeHtml(view.verificationLabel)}${view.persistenceWarning ? ` · ${escapeHtml(view.persistenceWarning)}` : ""}</p><div class="result-buttons">${play.mode !== "challenge" ? `<button class="social-button" data-retry-play>Retry</button>` : ""}${view.canChallenge && play.mode === "post" ? `<button class="social-button" data-create-challenge>Challenge</button>` : ""}${view.showFollow ? `<button class="social-button" data-follow="${creator.id}">${service.isFollowing(creator.id) ? "Following" : "Follow"}</button>` : ""}${view.showLike ? `<button class="social-button" data-like="${source.id}">${service.isLiked(source.id) ? "♥ Liked" : "♡ Like"}</button>` : ""}<button class="social-button primary" data-continue>Continue</button></div></div></section></div>`;
}

async function mountActivePlayable() {
  const play = ui.play;
  if (!play) return;
  play.mountPending = false;
  const canvas = document.querySelector("#socialCanvas"); const status = document.querySelector("#playStatus");
  if (!canvas) return;
  const source = play.postId ? post(play.postId) : play.source;
  try {
    const controller = await playableHost.mount(canvas, source.playableRef, source.resultPolicy, {
      onError: (error) => {
        if (ui.play !== play || !play.runtimeStarted || play.runtimeFailureLogged) return;
        play.runtimeFailureLogged = true;
        if (status) status.textContent = `Runtime error: ${error.message}`;
        analytics.log("social_post_play_failed", socialEventProperties(presentationMode, { post_id: source.id || null, game_id: source.playableRef.gameId, reason: "runtime_error", source: play.mode }));
      },
      onFinish: (normalized, snapshot) => finishPlay(normalized, snapshot),
    });
    if (!isActiveMountedPlay({ activePlay: ui.play, play, controller })) return;
    play.runtimeStarted = true;
    analytics.log("social_post_play_started", socialEventProperties(presentationMode, { post_id: source.id || null, game_id: source.playableRef.gameId, runtime: source.playableRef.runtime, source: play.mode }));
    if (status) status.textContent = presentationMode === "creator" ? source.caption : "Play the same exact game version and seed.";
  } catch (error) {
    if (!isActivePlayRequest({ activePlay: ui.play, play })) return;
    if (!play.mountFailureLogged) {
      play.mountFailureLogged = true;
      analytics.log("social_post_play_failed", socialEventProperties(presentationMode, { post_id: source.id || null, game_id: source.playableRef.gameId, reason: mountFailureReason(error), source: play.mode }));
    }
    if (status) status.textContent = `Playable unavailable: ${error.message}`;
  }
}

function finishPlay(normalized, snapshot) {
  if (!ui.play || ui.play.finished) return;
  try {
    const play = ui.play; const source = play.postId ? post(play.postId) : play.source;
    if (!play.postId) {
      play.result = normalized; play.finished = true; play.persisted = true;
      if (normalized.status === "completed" && normalized.metric !== null) ui.benchmarkAttempt = service.createBenchmarkAttempt({ playableRef: source.playableRef, policy: source.resultPolicy, status: normalized.status, metric: normalized.metric, replayEvidence: { kind: "local_snapshot", elapsedMs: Math.round(snapshot?.elapsedMs || 0) } });
      render(); return;
    }
    const saved = service.recordResult({ postId: source.id, playableRef: source.playableRef, status: normalized.status, metric: normalized.metric, replayEvidence: { kind: "local_snapshot", elapsedMs: Math.round(snapshot?.elapsedMs || 0) }, presentation: presentationMode });
    play.result = saved.result; play.persisted = saved.persisted; play.finished = true; play.comparison = service.comparisonFor(source.id, saved.result.id);
    applyPersistence(saved, "result");
    if (play.mode === "challenge" && saved.result.status === "completed" && saved.result.metric !== null) { const completed = service.completeChallenge(play.challengeId, saved.result.id); play.challengeComparison = completed.comparison; applyPersistence(completed, "challenge outcome"); }
  } catch (error) { ui.error = error.message; ui.play = null; }
  render();
}

function applyPersistence(outcome, subject) {
  ui.persistenceWarning = nextPersistenceWarning(outcome, subject);
  return outcome;
}

function startPost(postId, mode = "post", challenge = null) {
  playableHost.destroy();
  const source = service.post(postId);
  ui.play = { postId: source.id, mode, challengeId: challenge?.id || null, finished: false, result: null, comparison: null, mountPending: true, runtimeStarted: false, runtimeFailureLogged: false, mountFailureLogged: false };
  render();
}

function startBenchmark(gameId) {
  const catalog = bundledPlayable(gameId); if (!catalog) throw new Error("Approved playable unavailable");
  playableHost.destroy();
  ui.play = { postId: null, source: { id: null, playableRef: playableRefFor(catalog), resultPolicy: catalog.policy }, mode: "publish", finished: false, result: null, comparison: null, mountPending: true, runtimeStarted: false, runtimeFailureLogged: false, mountFailureLogged: false };
  analytics.log("social_post_play_requested", socialEventProperties(presentationMode, { game_id: catalog.id, runtime: catalog.runtime, source: "publish" }));
  render();
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("button"); if (!button) return;
  try {
    ui.error = null;
    if (button.dataset.view) { ui.view = button.dataset.view; ui.profileId = button.dataset.profile || null; ui.play = null; playableHost.destroy(); render(); return; }
    if (button.dataset.profile) { ui.view = "profile"; ui.profileId = button.dataset.profile; render(); return; }
    if (button.dataset.follow) { applyPersistence(service.setFollow(button.dataset.follow, !service.isFollowing(button.dataset.follow)), "follow change"); render(); return; }
    if (button.dataset.like) { applyPersistence(service.setLike(button.dataset.like, !service.isLiked(button.dataset.like)), "like"); render(); return; }
    if (button.dataset.play) { analytics.log("social_post_play_requested", socialEventProperties(presentationMode, { post_id: button.dataset.play, source: "post" })); startPost(button.dataset.play); return; }
    if (button.dataset.selectGame) { ui.selectedGameId = button.dataset.selectGame; ui.benchmarkAttempt = null; render(); return; }
    if (button.dataset.previewPublish) {
      startBenchmark(button.dataset.previewPublish); return;
    }
    if (button.dataset.publish !== undefined) {
      const caption = ui.publishCaption;
      const validation = publishValidation({ gameId: ui.selectedGameId, caption, benchmarkAttempt: ui.benchmarkAttempt });
      if (!validation.valid) { document.querySelector("#publishStatus").textContent = validation.errors.join(" · "); return; }
      const published = service.publish({ gameId: ui.selectedGameId, caption, benchmarkAttempt: ui.benchmarkAttempt });
      applyPersistence(published, "published post"); ui.benchmarkAttempt = null; ui.publishCaption = ""; ui.view = "profile"; ui.profileId = service.actorId(); render(); return;
    }
    if (button.dataset.challenge) {
      const challenge = service.openChallenge(button.dataset.challenge);
      if (service.challengeCapabilities(challenge).canRespond) { analytics.log("social_post_play_requested", socialEventProperties(presentationMode, { post_id: challenge.sourcePostId, source: "challenge" })); startPost(challenge.sourcePostId, "challenge", challenge); }
      else if (service.challengeCapabilities(challenge).canViewOutcome) { ui.outcomeChallengeId = challenge.id; render(); }
      return;
    }
    if (button.dataset.cancelChallenge) { applyPersistence(service.cancelChallenge(button.dataset.cancelChallenge), "challenge cancellation"); render(); return; }
    if (button.dataset.closeOutcome !== undefined) { ui.outcomeChallengeId = null; render(); return; }
    if (button.dataset.closePlay !== undefined || button.dataset.continue !== undefined) { playableHost.destroy(); ui.play = null; render(); return; }
    if (button.dataset.retryPlay !== undefined) { const { postId, mode, challengeId } = ui.play; const challenge = challengeId ? service.openChallenge(challengeId) : null; if (postId) startPost(postId, mode, challenge); else startBenchmark(ui.selectedGameId); return; }
    if (button.dataset.createChallenge !== undefined) {
      const target = post(ui.play.postId).creatorId === service.actorId() ? null : post(ui.play.postId).creatorId;
      applyPersistence(service.createChallenge({ postId: ui.play.postId, resultId: ui.play.result.id, targetActorId: target }), "challenge"); ui.view = "challenges"; ui.play = null; render();
    }
  } catch (error) { ui.error = error.message; render(); }
});

root.addEventListener("input", (event) => {
  if (event.target?.id === "publishCaption") ui.publishCaption = event.target.value;
});

window.addEventListener("pagehide", () => playableHost.destroy(), { once: true });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui.outcomeChallengeId) {
    ui.outcomeChallengeId = null;
    render();
  } else if (event.key === "Escape" && ui.play) {
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
