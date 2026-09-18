# Playloop social v0 architecture

## Product loop

The v0 proves one complete social interaction:

`creator → playable post → creator context → exact play → comparable local result → Like / Follow / Challenge → continue`

The default PWA route now opens creator-framed Discover. `?legacy=1` preserves the original anonymous handcrafted feed as an explicit playtest/control surface. `?presentation=anonymous` is a QA control presentation, not a randomized experiment assignment; it reuses the exact same playable while removing creator treatment. Both presentations keep game execution separate from feed presentation, leaving a future anonymous-vs-creator experiment possible without forking game logic.

## Modules

- `src/social/domain.js` owns validation, immutable playable identity, trusted result policies and pure comparison.
- `src/social/service.js` owns feed, profile, Like, Follow, result, challenge and publish use cases.
- `src/social/repository.js` owns the versioned local schema, safe parsing, recovery and atomic in-memory updates.
- `src/social/fixtures.js` creates the deterministic first-run social world.
- `src/social/impressions.js` owns qualified-exposure tracking independently from DOM rendering.
- `src/social/catalog.js` is the trusted shell's approved bundled-playable registry.
- `src/social/playable-host.js` resolves a `PlayableRef`, recomputes the existing publication envelope, selects the versioned runtime and normalizes terminal runtime state.
- `src/social/presentation.js` converts domain state into testable copy/CTA state.
- `src/social/app.js` is the mobile web adapter and navigation layer.

The application service depends on repository and actor-provider behavior, not on `localStorage`. A remote repository and authenticated actor provider can replace the v0 adapters without changing the domain objects or UI use cases.

## Domain model

### CreatorProfile

Profiles have stable ids, unique-style handles, display names, bounded avatar representation, optional bio/badge and an `isLocal` marker. Post and follower counts are derived from repository relationships rather than duplicated counters.

### PlayablePost

A published post stores creator id, bounded caption, creation time, `PlayableRef`, `ResultPolicy`, optional benchmark result, optional passive-preview metadata and optional remix lineage. It never contains executable creator code or social authority.

Lineage preserves original post, parent post and original creator ids. The v0 exposes one seeded remix example but deliberately does not include a remix editor.

### PlayableRef

`PlayableRef` is the exact challenge identity:

- runtime id;
- game id;
- publication-manifest version;
- SHA-256 manifest reference;
- SHA-256 GameSpec reference;
- deterministic seed.

Every field participates in equality. A challenge response with another seed, spec hash, manifest hash, manifest version or runtime is rejected. The social layer does not retain a mutable raw GameSpec.

The web host resolves only a trusted bundled catalog entry, lazy-fetches its GameSpec on Play, runs the existing publication validation/content-addressing path, and requires the recomputed refs to equal the post refs before execution. This boundary is ready for a future signed manifest/CDN resolver.

### PlayResult and ResultPolicy

A result records actor, post, exact `PlayableRef`, completion/failure, normalized metric, time and explicit verification state. The closed v0 states are `unverified` for seeded/demo results whose execution was not observed by this client, and `trusted_shell_local` for runs observed through `PlayableHost` on this device but not approved by a server or anti-cheat verifier. Seed fixture benchmarks are never presented as trusted local runs.

Trusted policies are a closed enum:

- higher score wins;
- lower time wins;
- lower move count wins;
- completion before failure, followed by any of those bounded scalar tie-breaks needed by current content.

Creator text and GameSpec actions cannot define comparison code. Comparison is pure, rejects mismatched playable identities and avoids a comparison when completion/metrics do not support one.

### Like and Follow

Likes and follows are unique actor/object relationships. `setLike` and `setFollow` accept a desired state, so repeated writes are idempotent. Following is queried by the Following feed immediately after mutation.

### Challenge

A challenge captures challenger, optional target/open semantics, source post, exact `PlayableRef`, challenger result, optional response result, state and time. Completing it requires:

1. an open challenge;
2. a response from the expected actor;
3. a completed response owned by that actor and the challenge's exact source post;
4. the exact challenge playable identity and seed;
5. comparison through the source post's trusted policy.

Challenge creation has the symmetric binding: its result must belong to the challenger, be completed, name the exact source post and match every `PlayableRef` field. Another post's result is rejected even when it uses the same playable revision and seed.

The local UI can simulate the targeted actor for an outbound challenge so the asynchronous state machine can be exercised on one device. This is clearly local behavior, not messaging, delivery or server verification.

## Trusted shell versus GameSpec

GameSpec remains bounded declarative creator content. It receives no account, profile, Like, Follow, Challenge, messaging, storage, network, DOM, filesystem, payment or unrestricted device APIs.

The trusted shell owns social repositories, actor identity, navigation, publication selection, analytics and normalized runtime results. The only bridge from runtime to social state is a terminal snapshot passed through `PlayableHost`; social code never interprets arbitrary runtime events as social commands.

Only an opened modal owns an active runtime. Feed cards render metadata/poster state and do not fetch or simulate their playable. Closing, continuing, switching surface or leaving the page destroys the controller.

## Local persistence

`playloop.social.v1` stores schema version 1. The repository:

- parses once at startup behind one adapter;
- validates unique profile ids/handles, post/result/challenge ids and Like/Follow relationships;
- validates benchmark ownership, result/post playable equality, challenge attempt/response ownership and remix lineage;
- rejects a malformed persisted snapshot rather than preserving believable but ambiguous relationships;
- restores deterministic fixtures if JSON or schema is malformed;
- seeds only when no valid state exists;
- guards access to the browser `localStorage` getter itself;
- catches storage/quota failures and keeps the current in-memory session usable.

Every mutation returns `persisted`. The UI uses one shared non-blocking warning when a Like, Follow, result, challenge, completion or publication exists only for the current session. It never claims that a benchmark or post was stored when device persistence is unavailable.

Likes, follows, created posts, results and challenges survive reload when storage is available. A future remote repository should implement the same use cases with server idempotency/versioning; it should not expose HTTP details to the domain/UI.

## Current actor and future authentication

`CurrentActorProvider` reads the actor id/profile through the repository. No use case directly reads a local-storage user. Future auth replaces this provider and supplies authenticated actor identity; signup/password/reset are intentionally absent.

## Feed and profile semantics

Discover is a deterministic reverse-chronological v0 feed. Following filters that same post domain by persisted follow relationships. Challenges is a separate inbox-like surface. Profiles preserve identity continuity and derive post/follower counts.

Recommendation ranking is intentionally replaceable at `SocialService.feed`; no fake recommender or fake HTTP API was added.

## Publishing

The v0 flow is approved catalog → exact preview/run → completed benchmark → bounded caption → publication. Publishing rejects unknown playables, missing/wrong/failed benchmarks and invalid post data. It stores the approved immutable ref, never arbitrary pasted GameSpec or JavaScript.

The preview attempt remains attached to the source post where it actually ran. Publication creates a new benchmark record for the new post with `sourceResultId` pointing to that attempt. This preserves provenance while ensuring the published benchmark belongs to its own post.

Bundled catalog hashes were produced by the existing `buildPublicationEnvelope` path. `PlayableHost` recomputes them before each execution, so changing a fixture without updating trusted refs visibly fails instead of silently changing a challenge.

## Analytics

Social modules receive the existing `Analytics` instance and call its central `log` method. They never write the analytics event store. Events include:

- `social_feed_viewed`, `social_feed_scope_changed`, `social_post_impression`;
- `social_post_play_started`, `social_post_play_result`;
- `social_like_changed`, `social_follow_changed`, `social_profile_opened`;
- `social_challenge_created`, `social_challenge_opened`, `social_challenge_completed`;
- `social_publish_started`, `social_publish_completed`, `social_publish_failed`.

Metadata is ids, booleans, policy/runtime types and bounded status values. Captions, arbitrary creator text and GameSpecs are excluded. Because events use the central pipeline, active experiment context propagates automatically.

`social_post_impression` means a card reached at least 50% visibility continuously for 350 ms. `IntersectionObserver` supplies the normal signal; a geometry-based viewport check is the conservative compatibility fallback. Exposure is deduplicated by post id for the page session, including across rerenders and Discover/Profile. Rendering a card alone emits nothing. Feed/profile view events are also deduplicated per surface during a page session.

## Anonymous experiment control

`?presentation=anonymous` uses the same post, `PlayableRef`, runtime and GameSpec, but removes creator identity, caption/challenge framing, benchmark/opponent framing, Like, Follow and Challenge actions before and after play. It retains neutral game framing, the player's result, Retry and Continue. Presentation changes social treatment, never playable execution. Relevant social funnel events carry `presentation: "creator" | "anonymous"`; the query string does not emit experiment exposure or activate random assignment. A future experiment should use the existing experiment registry/override infrastructure.

## Offline/PWA

Cache generation `playloop-spike-v16` includes the full static social import graph and the five approved zero-asset GameSpecs. Same-origin navigation failures fall back to the cached index shell, so documented query-string entry points reopen offline. The existing offline dependency-graph test walks transitive JS imports. Runtime specs are also explicitly cached because they are fetched data rather than JS imports.

## Replacement and extension points

- backend: replace `LocalSocialRepository`;
- authentication: replace `CurrentActorProvider`;
- remote/CDN playables: replace the bundled resolver inside `PlayableHost`, then require signed manifest verification;
- recommendations: replace feed selection/ranking behind the service;
- server verification: submit bounded replay/input evidence and return a new explicit verification state rather than upgrading local results silently;
- notifications: observe backend challenge state without granting GameSpec notification authority;
- AI creation: produce reviewed publication candidates for the trusted catalog/pipeline, then use the same publish service;
- remix: populate existing lineage fields and validate attribution through a future creator flow;
- KMP: share the domain contracts and runtime/replay semantics while replacing DOM rendering/storage adapters.

## Final foundation semantics

Create first records a transient bounded benchmark attempt directly against an approved immutable `PlayableRef`. Publishing then atomically creates the new post and its post-owned `PlayResult`; no existing social post or synthetic source result is required. Persisted results always have a real post, actor, exact playable identity, canonical timestamp, bounded verification state, and only the supported `local_snapshot` replay marker. Preview metadata is likewise limited to a poster/tone variant.

Transient publication attempts have their own bounded contract and contain no result/post identity. Publication revalidates the contract and requires a completed `trusted_shell_local` attempt observed through the current device's PlayableHost; fixture/unverified attempts cannot become creator benchmarks.

Challenge capability is derived centrally for the current actor. Inbound targeted and other-creator open challenges can be answered; outbound and own open challenges cannot. Completing an open challenge atomically binds `targetActorId` to the actual responder, so completed history validates independently of whichever actor later loads it. Normal product result recording always uses the current actor, so this local shell cannot impersonate seeded creators. An open challenge may be cancelled only by its challenger.

An impression requires 50% visibility for 350 ms, while the document is visible and no playable/result/outcome modal obscures the feed. Any interruption cancels dwell; closing it requires a fresh full interval. Social play telemetry carries a bounded `presentation` value and follows request → successful mounted start → terminal result, or request → one bounded failure. Superseded mounts emit neither start nor failure; post-mount runtime faults emit one runtime failure. A later successful full-state persistence write clears a prior session-only warning because the repository persists its entire snapshot.

## Known v0 limitations

- One local actor and deterministic seeded creators; outbound challenges remain pending until a future authenticated recipient can answer them.
- No backend delivery, accounts, server verification, anti-cheat, ghost playback or public deep links.
- Approved content is bundled; no remote CDN resolver or signed publication manifests yet.
- Passive previews are deterministic posters, not uploaded/transcoded video.
- Discover is chronological, not personalized.
- Local result evidence is a bounded snapshot marker, not a full public replay proof.
- Profile editing, comments, DMs, notifications, moderation UI, AI creation and full remix creation remain out of scope.
