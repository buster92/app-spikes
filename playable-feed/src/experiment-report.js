const CLIENT_ERROR_EVENTS = new Set([
  "client_error",
  "client_unhandled_rejection",
]);

const LOAD_RENDER_ERROR_EVENTS = new Set([
  "game_mount_error",
  "game_empty_render",
]);

const ATTRIBUTION_EVENTS = new Set([
  "feed_started",
  "game_first_interaction",
  "feed_reach_milestone",
  "game_impression",
  "game_skip",
  "session_end",
  ...CLIENT_ERROR_EVENTS,
  ...LOAD_RENDER_ERROR_EVENTS,
]);

function eventOrderValue(event) {
  if (event?.session_ms != null) {
    const sessionMs = Number(event.session_ms);
    if (Number.isFinite(sessionMs)) return sessionMs;
  }
  const timestamp = Date.parse(event?.ts || "");
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function compareEvents(a, b) {
  const byTime = eventOrderValue(a) - eventOrderValue(b);
  if (byTime !== 0) return byTime;
  const aSequence = Number(a?.sequence);
  const bSequence = Number(b?.sequence);
  if (Number.isFinite(aSequence) && Number.isFinite(bSequence)) return aSequence - bSequence;
  const byReportOrder = String(a?.__report_order || "").localeCompare(String(b?.__report_order || ""));
  if (byReportOrder !== 0) return byReportOrder;
  return String(a?.event_id || "").localeCompare(String(b?.event_id || ""));
}

function rate(numerator, denominator) {
  return {
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null,
  };
}

function median(values) {
  const sorted = values
    .filter((value) => value != null && value !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function firstByName(events, name) {
  return events.find((event) => event?.name === name) || null;
}

function matchesContext(event, experimentId, variantId) {
  return event?.experiment_context?.[experimentId] === variantId;
}

function immediateSkipWithoutInteraction(events) {
  const firstImpressionIndex = events.findIndex((event) => event?.name === "game_impression");
  if (firstImpressionIndex < 0) return false;

  const impression = events[firstImpressionIndex];
  const gameId = impression.game_id ?? null;
  const variantId = impression.variant_id ?? null;

  for (let index = firstImpressionIndex + 1; index < events.length; index += 1) {
    const event = events[index];
    if (event?.name === "game_impression") break;
    if (gameId != null && event?.game_id != null && event.game_id !== gameId) continue;
    if (variantId != null && event?.variant_id != null && event.variant_id !== variantId) continue;
    if (event?.name === "game_first_interaction") return false;
    if (event?.name === "game_skip") return true;
  }
  return false;
}

export function eventsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.events)) return payload.events;
  throw new TypeError("Playloop report input must be an event array or an export object with an events array");
}

export function mergeExportEvents(payloads) {
  const merged = [];
  const seenEventIds = new Set();

  payloads.forEach((payload, payloadIndex) => {
    eventsFromPayload(payload).forEach((event, eventIndex) => {
      if (!event || typeof event !== "object") return;
      const eventId = typeof event.event_id === "string" && event.event_id.length ? event.event_id : null;
      if (eventId) {
        if (seenEventIds.has(eventId)) return;
        seenEventIds.add(eventId);
      }
      merged.push({
        ...event,
        __report_order:
          String(payloadIndex).padStart(6, "0") + ":" + String(eventIndex).padStart(8, "0"),
      });
    });
  });

  return merged;
}

function cleanEvent(event) {
  const { __report_order, ...clean } = event;
  return clean;
}

function collectExperimentIds(events) {
  return [...new Set(
    events
      .filter((event) => event?.name === "experiment_exposure")
      .map((event) => event?.experiment_id)
      .filter((value) => typeof value === "string" && value.length > 0),
  )].sort();
}

function exposureGroups(events, experimentId) {
  const malformed = [];
  const bySession = new Map();

  for (const event of events) {
    if (event?.name !== "experiment_exposure" || event?.experiment_id !== experimentId) continue;
    if (!event.session_id || !event.variant_id) {
      malformed.push(event);
      continue;
    }
    if (!bySession.has(event.session_id)) bySession.set(event.session_id, []);
    bySession.get(event.session_id).push(event);
  }

  return { bySession, malformed };
}

function sessionResult(sessionId, exposure, sessionEvents, experimentId, variantId) {
  const exposureOrder = eventOrderValue(exposure);
  const attributed = sessionEvents
    .filter((event) => eventOrderValue(event) >= exposureOrder)
    .filter((event) => matchesContext(event, experimentId, variantId))
    .sort(compareEvents);

  const feedStarted = firstByName(attributed, "feed_started");
  const firstInteraction = firstByName(attributed, "game_first_interaction");
  const reachedThree = attributed.some(
    (event) => event?.name === "feed_reach_milestone" && Number(event.games_seen) >= 3,
  );
  const reachedFive = attributed.some(
    (event) => event?.name === "feed_reach_milestone" && Number(event.games_seen) >= 5,
  );
  const reachedTen = attributed.some(
    (event) => event?.name === "feed_reach_milestone" && Number(event.games_seen) >= 10,
  );
  const ended = attributed.some((event) => event?.name === "session_end");
  const clientError = attributed.some((event) => CLIENT_ERROR_EVENTS.has(event?.name));
  const loadRenderError = attributed.some((event) => LOAD_RENDER_ERROR_EVENTS.has(event?.name));
  const gamesSeen = attributed.filter((event) => event?.name === "game_impression").length;

  const afterExposure = sessionEvents
    .filter((event) => eventOrderValue(event) >= exposureOrder)
    .sort(compareEvents);
  const unattributedMetricEvents = afterExposure.filter(
    (event) => ATTRIBUTION_EVENTS.has(event?.name) && !matchesContext(event, experimentId, variantId),
  );

  return {
    session_id: sessionId,
    exposure: cleanEvent(exposure),
    feed_started: Boolean(feedStarted),
    first_interaction: Boolean(firstInteraction),
    reach_3: reachedThree,
    reach_5: reachedFive,
    reach_10: reachedTen,
    ended,
    ended_before_feed_start: ended && !feedStarted,
    immediate_skip_without_interaction: immediateSkipWithoutInteraction(attributed),
    client_error: clientError,
    load_render_error: loadRenderError,
    feed_start_ms: feedStarted?.session_ms != null && Number.isFinite(Number(feedStarted.session_ms))
      ? Number(feedStarted.session_ms)
      : null,
    first_interaction_ms:
      firstInteraction?.session_ms != null && Number.isFinite(Number(firstInteraction.session_ms))
        ? Number(firstInteraction.session_ms)
        : null,
    games_seen: gamesSeen,
    unattributed_metric_events: unattributedMetricEvents.map(cleanEvent),
  };
}

function summarizeVariant(variantId, sessions) {
  const exposed = sessions.length;
  const ended = sessions.filter((session) => session.ended).length;

  return {
    variant_id: variantId,
    exposed_sessions: exposed,
    feed_start: rate(sessions.filter((session) => session.feed_started).length, exposed),
    first_interaction: rate(sessions.filter((session) => session.first_interaction).length, exposed),
    reach_3: rate(sessions.filter((session) => session.reach_3).length, exposed),
    reach_5: rate(sessions.filter((session) => session.reach_5).length, exposed),
    reach_10: rate(sessions.filter((session) => session.reach_10).length, exposed),
    median_feed_start_ms: median(sessions.map((session) => session.feed_start_ms)),
    median_first_interaction_ms: median(sessions.map((session) => session.first_interaction_ms)),
    median_games_seen: median(sessions.map((session) => session.games_seen)),
    client_error_sessions: rate(sessions.filter((session) => session.client_error).length, exposed),
    ended_before_feed_start: rate(
      sessions.filter((session) => session.ended_before_feed_start).length,
      ended,
    ),
    immediate_skip_without_interaction: rate(
      sessions.filter((session) => session.immediate_skip_without_interaction).length,
      exposed,
    ),
    load_render_error_sessions: rate(
      sessions.filter((session) => session.load_render_error).length,
      exposed,
    ),
  };
}

export function analyzeExperiment(events, experimentId) {
  const cleanedEvents = events.filter((event) => event && typeof event === "object");
  const { bySession, malformed } = exposureGroups(cleanedEvents, experimentId);
  const sessionsByVariant = new Map();
  const exclusions = {
    forced_sessions: 0,
    conflicting_variant_sessions: 0,
    malformed_exposure_events: malformed.length,
    duplicate_exposure_events: 0,
  };

  const validSessions = [];
  let unattributedMetricEvents = 0;
  let sessionsWithUnattributedMetricEvents = 0;

  for (const [sessionId, exposures] of bySession.entries()) {
    const ordered = [...exposures].sort(compareEvents);
    if (ordered.some((event) => event.forced === true)) {
      exclusions.forced_sessions += 1;
      continue;
    }

    const variantIds = new Set(ordered.map((event) => event.variant_id));
    if (variantIds.size !== 1) {
      exclusions.conflicting_variant_sessions += 1;
      continue;
    }

    exclusions.duplicate_exposure_events += Math.max(0, ordered.length - 1);
    const variantId = ordered[0].variant_id;
    const exposure = ordered[0];
    const sessionEvents = cleanedEvents
      .filter((event) => event?.session_id === sessionId)
      .sort(compareEvents);
    const result = sessionResult(
      sessionId,
      exposure,
      sessionEvents,
      experimentId,
      variantId,
    );

    const missingCount = result.unattributed_metric_events.length;
    unattributedMetricEvents += missingCount;
    if (missingCount > 0) sessionsWithUnattributedMetricEvents += 1;

    if (!sessionsByVariant.has(variantId)) sessionsByVariant.set(variantId, []);
    sessionsByVariant.get(variantId).push(result);
    validSessions.push(result);
  }

  const variants = [...sessionsByVariant.entries()]
    .map(([variantId, sessions]) => summarizeVariant(variantId, sessions))
    .sort((a, b) => {
      if (a.variant_id === "control") return -1;
      if (b.variant_id === "control") return 1;
      return a.variant_id.localeCompare(b.variant_id);
    });

  return {
    experiment_id: experimentId,
    valid_exposed_sessions: validSessions.length,
    variants,
    exclusions,
    data_quality: {
      unattributed_metric_events: unattributedMetricEvents,
      sessions_with_unattributed_metric_events: sessionsWithUnattributedMetricEvents,
    },
  };
}

export function analyzeExperimentPayloads(payloads, { experimentId = null } = {}) {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw new TypeError("At least one Playloop export payload is required");
  }

  const events = mergeExportEvents(payloads);
  const availableExperimentIds = collectExperimentIds(events);
  if (availableExperimentIds.length === 0) {
    throw new Error("No experiment_exposure events were found in the supplied exports");
  }
  if (experimentId && !availableExperimentIds.includes(experimentId)) {
    throw new Error("Experiment not found in supplied exports: " + experimentId);
  }
  const experimentIds = experimentId ? [experimentId] : availableExperimentIds;

  return {
    schema: 1,
    generated_at: new Date().toISOString(),
    input_payloads: payloads.length,
    unique_events: events.length,
    experiments: experimentIds.map((id) => analyzeExperiment(events, id)),
  };
}

function formatPercent(metric) {
  if (!metric || metric.rate == null) return "—";
  return (metric.rate * 100).toFixed(1) + "% (" + metric.numerator + "/" + metric.denominator + ")";
}

function formatMs(value) {
  if (value == null) return "—";
  if (value < 1000) return Math.round(value) + " ms";
  return (value / 1000).toFixed(1) + " s";
}

function formatNumber(value) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ppDelta(metric, baselineMetric) {
  if (!metric || !baselineMetric || metric.rate == null || baselineMetric.rate == null) return null;
  return (metric.rate - baselineMetric.rate) * 100;
}

function signed(value, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(1) + suffix;
}

function variantComparisonLines(experiment) {
  if (experiment.variants.length < 2) return [];
  const baseline = experiment.variants.find((variant) => variant.variant_id === "control")
    || experiment.variants[0];

  return experiment.variants
    .filter((variant) => variant.variant_id !== baseline.variant_id)
    .map((variant) => {
      const feed = ppDelta(variant.feed_start, baseline.feed_start);
      const interaction = ppDelta(variant.first_interaction, baseline.first_interaction);
      const reach = ppDelta(variant.reach_3, baseline.reach_3);
      return "- **" + variant.variant_id + " vs " + baseline.variant_id
        + ":** feed start " + signed(feed, " pp")
        + ", first interaction " + signed(interaction, " pp")
        + ", reach 3 " + signed(reach, " pp") + ".";
    });
}

export function renderExperimentMarkdown(report) {
  const lines = [
    "# Playloop experiment report",
    "",
    "Generated: " + report.generated_at,
    "Inputs: " + report.input_payloads + " export(s) · " + report.unique_events + " unique event(s)",
    "",
    "> Descriptive report only. It shows raw session counts, rates, timing and guardrails; it does not infer statistical significance or declare a winning variant.",
    "",
  ];

  for (const experiment of report.experiments) {
    lines.push(
      "## " + experiment.experiment_id,
      "",
      "**Valid exposed sessions:** " + experiment.valid_exposed_sessions,
      "",
      "### At a glance",
      "",
      "| Variant | Exposed | Feed start | First interaction | Reach 3 |",
      "| --- | ---: | ---: | ---: | ---: |",
    );

    for (const variant of experiment.variants) {
      lines.push(
        "| " + variant.variant_id
          + " | " + variant.exposed_sessions
          + " | " + formatPercent(variant.feed_start)
          + " | " + formatPercent(variant.first_interaction)
          + " | " + formatPercent(variant.reach_3) + " |",
      );
    }

    lines.push(
      "",
      "### Timing & depth",
      "",
      "| Variant | Median feed start | Median first interaction | Reach 5 | Reach 10 | Median games seen |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
    );

    for (const variant of experiment.variants) {
      lines.push(
        "| " + variant.variant_id
          + " | " + formatMs(variant.median_feed_start_ms)
          + " | " + formatMs(variant.median_first_interaction_ms)
          + " | " + formatPercent(variant.reach_5)
          + " | " + formatPercent(variant.reach_10)
          + " | " + formatNumber(variant.median_games_seen) + " |",
      );
    }

    lines.push(
      "",
      "### Guardrails",
      "",
      "| Variant | Client error sessions | Ended before feed start* | Immediate skip without interaction | Load/render error sessions |",
      "| --- | ---: | ---: | ---: | ---: |",
    );

    for (const variant of experiment.variants) {
      lines.push(
        "| " + variant.variant_id
          + " | " + formatPercent(variant.client_error_sessions)
          + " | " + formatPercent(variant.ended_before_feed_start)
          + " | " + formatPercent(variant.immediate_skip_without_interaction)
          + " | " + formatPercent(variant.load_render_error_sessions) + " |",
      );
    }

    lines.push(
      "",
      "*Ended-before-feed-start uses only sessions with a recorded session_end as its denominator, so an open/truncated session is not silently counted as an exit.",
      "",
    );

    const comparisons = variantComparisonLines(experiment);
    if (comparisons.length) {
      lines.push("### Directional differences", "", ...comparisons, "");
    }

    const exclusions = experiment.exclusions;
    lines.push(
      "### Data quality",
      "",
      "- Forced sessions excluded: **" + exclusions.forced_sessions + "**",
      "- Conflicting-variant sessions excluded: **" + exclusions.conflicting_variant_sessions + "**",
      "- Malformed exposure events excluded: **" + exclusions.malformed_exposure_events + "**",
      "- Duplicate exposure events collapsed: **" + exclusions.duplicate_exposure_events + "**",
      "- Post-exposure KPI/guardrail events missing matching experiment context: **"
        + experiment.data_quality.unattributed_metric_events + "** across **"
        + experiment.data_quality.sessions_with_unattributed_metric_events + "** session(s)",
      "",
    );
  }

  return lines.join("\n").trimEnd() + "\n";
}
