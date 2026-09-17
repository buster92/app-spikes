# Playloop KMP runtime contract v0

This document fixes the boundary that the current web GameSpec sandbox is expected to preserve when the consumer app moves to Kotlin Multiplatform.

The goal is **one creator package, one rules engine, platform-specific rendering/input only**. A game must not gain capabilities simply because it is executing on Android or iOS instead of the web reference runtime.

## Module split

```text
playloop-runtime/
  commonMain/
    model/
      GameSpec.kt
      AssetRef.kt
      EntitySpec.kt
      RuleSpec.kt
    validation/
      GameSpecValidator.kt
      PublicationPolicy.kt
      RuntimeBudgets.kt
    runtime/
      RuntimeCore.kt
      RuntimeState.kt
      SeededRandom.kt
      Collision.kt
      Expressions.kt
      Actions.kt
    host/
      HostEffect.kt
      RuntimeSnapshot.kt
      AssetResolver.kt
      RuntimeClock.kt

  androidMain/
    renderer/SkiaRenderer.kt
    input/AndroidInputAdapter.kt
    audio/AndroidAudioAdapter.kt
    haptics/AndroidHaptics.kt
    assets/AndroidAssetCache.kt

  iosMain/
    renderer/SkiaRenderer.kt
    input/IosInputAdapter.kt
    audio/IosAudioAdapter.kt
    haptics/IosHaptics.kt
    assets/IosAssetCache.kt
```

The exact renderer can change. The important constraint is that `commonMain` never depends on Compose, UIKit, Android Views, DOM, filesystem paths or arbitrary network access.

## Serializable model

The native model should remain a direct mapping of GameSpec JSON. Avoid platform-only convenience fields in the published format.

Illustrative Kotlin shape:

```kotlin
@Serializable
data class GameSpec(
    val schemaVersion: Int,
    val runtime: String,
    val id: String,
    val title: String,
    val canvas: CanvasSpec,
    val variables: Map<String, JsonPrimitive> = emptyMap(),
    val assets: List<AssetSpec> = emptyList(),
    val templates: Map<String, EntitySpec> = emptyMap(),
    val entities: List<EntitySpec> = emptyList(),
    val timers: List<TimerSpec> = emptyList(),
    val rules: List<RuleSpec> = emptyList(),
)

@Serializable
data class AssetSpec(
    val id: String,
    val kind: AssetKind,
    val ref: String,
    val bytes: Int,
    val mime: String,
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
data class EntitySpec(
    val id: String? = null,
    val kind: EntityKind,
    val asset: String? = null,
    val sourceX: Int? = null,
    val sourceY: Int? = null,
    val sourceWidth: Int? = null,
    val sourceHeight: Int? = null,
    val tags: List<String> = emptyList(),
    val x: Double = 0.0,
    val y: Double = 0.0,
    val vx: Double = 0.0,
    val vy: Double = 0.0,
    val width: Double = 40.0,
    val height: Double = 40.0,
    val radius: Double = 20.0,
    val rotation: Double = 0.0,
    val opacity: Double = 1.0,
    val color: String = "#ffffff",
    val text: String = "",
    val bounds: BoundsMode = BoundsMode.None,
    val collidable: Boolean = true,
    val interactive: Boolean = true,
)
```

The production implementation can use sealed classes internally, but the wire format should remain simple JSON so humans and AIs can author it reliably.

## Runtime API

A minimal common runtime interface:

```kotlin
interface PlayloopRuntime {
    val status: RuntimeStatus
    val elapsedMs: Long

    fun start()
    fun step(deltaMs: Long)
    fun pointer(event: PointerEvent)
    fun snapshot(): RuntimeSnapshot
}

interface RuntimeHost {
    fun onSemanticEvent(event: SemanticEvent)
    fun onEffect(effect: HostEffect)
}

sealed interface HostEffect {
    data class PlaySound(val assetRef: String, val volume: Float) : HostEffect
    data class Haptic(val patternMs: List<Int>) : HostEffect
    data class Emit(val name: String, val data: Map<String, JsonPrimitive>) : HostEffect
    data class Complete(val score: Double, val detail: String) : HostEffect
    data class Fail(val score: Double, val detail: String, val reason: String? = null) : HostEffect
}
```

`RuntimeHost` is one-way. Creator code never receives an Android `Context`, iOS object, HTTP client, database handle, account token, social API or payment API.

## Asset resolver

Published GameSpec references assets by SHA-256. The runtime asks the host for already-reviewed content by hash.

```kotlin
interface AssetResolver {
    suspend fun acquireImage(ref: Sha256Ref, expected: ImageMetadata): ImageHandle
    suspend fun acquireAudio(ref: Sha256Ref, expected: AudioMetadata): AudioHandle
    fun release(ref: Sha256Ref)
    fun releaseExcept(refs: Set<Sha256Ref>)
}
```

The platform resolver is responsible for:

- Playloop-controlled origin/CDN only;
- matching manifest metadata;
- SHA-256 verification after download;
- decoded dimension verification;
- decoded-memory accounting;
- disk/memory cache eviction;
- refusing unsupported formats or oversized media.

GameSpec itself never contains an arbitrary URL.

## Feed lifecycle

The native app should preserve the same resource model as the web reference implementation:

```text
previous post   runtime stopped/suspended, decoded creator assets releasable
visible post    one active runtime
next post       GameSpec + at most one bounded asset prefetch
rest of feed    post metadata / preview only
```

Recommended host state machine:

```text
METADATA_ONLY
  -> SPEC_PREFETCHED
  -> ASSETS_PREFETCHED
  -> ACTIVE
  -> SUSPENDED
  -> RELEASED
```

A creator game must never keep its own background coroutine, timer or audio channel alive after the host leaves `ACTIVE`.

## Determinism

Automated review and native reproduction need the same logical sequence for a fixed input stream and seed.

Requirements:

- use a fixed algorithm for seeded pseudo-random values;
- use runtime milliseconds, not wall-clock time, inside GameSpec;
- clamp each simulation step to the same hard maximum;
- process timers in deterministic order;
- keep collision-role normalization stable;
- keep rule/action order stable;
- keep runtime entity insertion order stable;
- do not use platform random, locale or floating wall-clock state in creator rules.

### Runtime entity identity

Spawn identity is replay-visible state and must not depend on map replacement behavior.

For a spawn action with an explicit `id`:

- if that id is not currently live, the spawn may use it;
- if that id is already live, execution fails deterministically with `spawn_id_collision`;
- destroying the prior entity frees the fixed id for a later intentional respawn.

For a spawn action without an explicit id, the runtime uses monotonically increasing `spawn-N` ids. Before selecting an id it skips:

1. ids that are currently live; and
2. fixed spawn ids declared anywhere in the GameSpec rules.

This prevents a generated spawn from consuming a name that a later rule expects to use explicitly. KMP must collect the same fixed ids recursively through `if` branches and apply the same monotonic skip behavior. It must never silently replace a live entity because a spawn id collides.

Pixel-identical rendering across platforms is not required. Equivalent logical state is.

## Safety budgets

The KMP runtime must treat the web limits as part of the public contract, not suggestions:

- max GameSpec bytes;
- max declared asset bytes;
- max decoded raster working set;
- max entities/templates/rules/timers;
- max actions per rule;
- max expression depth;
- max interpreted operations per step;
- max runtime duration.

The app may impose a **stricter** local limit under thermal/memory pressure. It must never silently grant a creator more capability than publication review assumed.

## Rendering contract

The renderer consumes snapshots/entities. It does not execute rules.

Supported v0 render primitives:

- circle;
- rectangle;
- text;
- sprite;
- sprite source rectangles for atlas reuse;
- opacity;
- rotation.

Atlas source rectangles are important for network weight: many visual elements can share one small content-addressed image.

A later runtime version can add animation tracks, particles, nine-patch panels, tile maps or skeletal animation, but each should be explicit in the versioned schema rather than implemented as arbitrary scripts.

## Input contract

The shell converts native gestures to bounded GameSpec events. v0 exposes only pointer/tap coordinates and deltas.

The game cannot:

- inspect raw device identifiers;
- access keyboard contents outside its surface;
- listen while off-screen;
- read accelerometer/camera/microphone unless a future explicitly reviewed capability exists.

If later versions add tilt, microphone or camera mechanics, they should be capability-gated and require both publication approval and user permission.

## Versioning

`runtime: playloop-2d-v0` is immutable once public creator content exists.

Breaking changes require a new runtime id. Native clients should support a bounded set of old runtime versions so published games do not unexpectedly change after an app update.

Suggested compatibility rule:

```text
GameSpec declares runtime version
        ↓
client supports version?
   yes -> validate again locally -> run
   no  -> show update/unavailable state
```

The server-side publication pipeline should also record the exact validator/runtime version used during review.

## Migration test strategy

Before making KMP the production runtime, create shared golden fixtures from the current JSON examples and compare logical snapshots between JS and Kotlin for fixed seeds/input traces.

Golden cases should cover:

- seeded spawn positions and generated-id collision skipping;
- explicit fixed spawn id collision failure;
- timer ordering;
- collision role normalization;
- sprite atlas metadata preservation;
- entity destruction/spawn;
- completion/failure results;
- runtime ceiling;
- operation-budget failure;
- background suspension semantics.

The migration is considered safe when the Kotlin engine produces equivalent snapshots/results for the same fixtures without special-casing individual games.
