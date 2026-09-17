import { simulateForAuthoring, validateForAuthoring } from "./creator-tools.js";

const encoder = new TextEncoder();
const MAX_BLOCKERS = 8;
const MAX_BLOCKER_LENGTH = 160;

function cleanText(value, maxLength = MAX_BLOCKER_LENGTH) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function safeAttempt(value) {
  const attempt = Number(value);
  return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
}

function safeAuthor(author) {
  if (!author || typeof author !== "object" || Array.isArray(author)) return null;
  return {
    kind: cleanText(author.kind, 40) || "unknown",
    provider: cleanText(author.provider, 80),
    model: cleanText(author.model, 120),
  };
}

function safeBlockers(blockers) {
  if (!Array.isArray(blockers)) return [];
  return blockers
    .map((value) => cleanText(value))
    .filter(Boolean)
    .slice(0, MAX_BLOCKERS);
}

function specBytes(spec) {
  try {
    return encoder.encode(JSON.stringify(spec)).byteLength;
  } catch {
    return null;
  }
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

export function evaluateCreatorPressureAttempt(rawAttempt, pressureCase, reviewOptions = {}) {
  const raw = rawAttempt && typeof rawAttempt === "object" && !Array.isArray(rawAttempt)
    ? rawAttempt
    : {};
  const caseId = cleanText(raw.caseId, 80) || null;
  const expectedCaseId = cleanText(pressureCase?.id, 80) || null;
  const attempt = safeAttempt(raw.attempt);
  const author = safeAuthor(raw.author);
  const blockers = safeBlockers(raw.blockers);

  if (!expectedCaseId || caseId !== expectedCaseId) {
    return {
      caseId,
      attempt,
      author,
      status: "invalid_envelope",
      valid: false,
      reviewOk: false,
      verdict: "reject",
      runtime: raw.spec?.runtime || null,
      specBytes: specBytes(raw.spec),
      blockers,
      diagnostics: [{
        severity: "error",
        stage: "pressure_protocol",
        code: "CASE_MISMATCH",
        path: "caseId",
        message: `Submission caseId '${caseId ?? "<missing>"}' does not match '${expectedCaseId ?? "<missing>"}'`,
      }],
      warnings: [],
    };
  }

  if (raw.status === "blocked") {
    return {
      caseId,
      attempt,
      author,
      status: "blocked",
      valid: false,
      reviewOk: false,
      verdict: "blocked",
      runtime: null,
      specBytes: null,
      blockers: blockers.length ? blockers : ["unspecified capability gap"],
      diagnostics: [],
      warnings: [],
    };
  }

  if (!raw.spec || typeof raw.spec !== "object" || Array.isArray(raw.spec)) {
    return {
      caseId,
      attempt,
      author,
      status: "invalid_envelope",
      valid: false,
      reviewOk: false,
      verdict: "reject",
      runtime: null,
      specBytes: null,
      blockers,
      diagnostics: [{
        severity: "error",
        stage: "pressure_protocol",
        code: "MISSING_SPEC",
        path: "spec",
        message: "Submitted attempts must include a GameSpec object unless status is 'blocked'",
      }],
      warnings: [],
    };
  }

  const validation = validateForAuthoring(raw.spec);
  let simulation = null;
  if (validation.ok) {
    simulation = simulateForAuthoring(raw.spec, {
      seeds: reviewOptions.seeds || [1, 7, 42],
      maxSimulatedMs: reviewOptions.maxSimulatedMs || 6000,
    });
  }

  const diagnostics = [
    ...(validation.diagnostics || []),
    ...((simulation?.diagnostics || []).filter((diagnostic) =>
      !(validation.diagnostics || []).some((existing) =>
        existing.code === diagnostic.code && existing.message === diagnostic.message
      )
    )),
  ];
  const warnings = [
    ...(validation.warnings || []),
    ...(simulation?.warnings || []),
  ];

  return {
    caseId,
    attempt,
    author,
    status: "submitted",
    valid: validation.ok,
    reviewOk: Boolean(simulation?.ok),
    verdict: simulation?.verdict || (validation.ok ? "not_simulated" : "reject"),
    runtime: raw.spec.runtime || null,
    specBytes: validation.transport?.canonicalSpecBytes ?? specBytes(raw.spec),
    instantEligible: validation.transport?.instantEligible ?? null,
    blockers,
    diagnostics,
    warnings,
    reviewSummary: simulation?.summary || null,
  };
}

export function summarizeCreatorPressure(results, pressureCases = []) {
  const safeResults = Array.isArray(results) ? results : [];
  const safeCases = Array.isArray(pressureCases) ? pressureCases : [];
  const byCase = new Map();
  const diagnosticCounts = {};
  const blockerCounts = {};
  const runtimeCounts = {};

  for (const result of safeResults) {
    for (const diagnostic of result?.diagnostics || []) increment(diagnosticCounts, diagnostic.code || "VALIDATION_ERROR");
    for (const blocker of result?.blockers || []) increment(blockerCounts, blocker);
    if (result?.runtime) increment(runtimeCounts, result.runtime);
    if (!result?.caseId) continue;
    if (!byCase.has(result.caseId)) byCase.set(result.caseId, []);
    byCase.get(result.caseId).push(result);
  }

  const cases = [];
  let firstPassValidCases = 0;
  let firstPassReviewCases = 0;
  let blockedCases = 0;
  let totalRepairIterations = 0;
  let repairedCases = 0;

  for (const pressureCase of safeCases) {
    const attempts = [...(byCase.get(pressureCase.id) || [])].sort((a, b) => a.attempt - b.attempt);
    const firstValid = attempts.find((result) => result.valid);
    const firstReview = attempts.find((result) => result.reviewOk);
    const blocked = attempts.some((result) => result.status === "blocked") && !firstValid;
    const repairIterations = firstReview ? Math.max(0, firstReview.attempt - 1) : null;

    if (attempts.some((result) => result.attempt === 1 && result.valid)) firstPassValidCases += 1;
    if (attempts.some((result) => result.attempt === 1 && result.reviewOk)) firstPassReviewCases += 1;
    if (blocked) blockedCases += 1;
    if (repairIterations !== null && repairIterations > 0) {
      totalRepairIterations += repairIterations;
      repairedCases += 1;
    }

    cases.push({
      id: pressureCase.id,
      genre: pressureCase.genre || null,
      attempts: attempts.length,
      firstValidAttempt: firstValid?.attempt ?? null,
      firstReviewPassAttempt: firstReview?.attempt ?? null,
      repairIterations,
      blocked,
      latestVerdict: attempts.at(-1)?.verdict || null,
      latestRuntime: attempts.at(-1)?.runtime || null,
      latestSpecBytes: attempts.at(-1)?.specBytes ?? null,
    });
  }

  const attemptedCases = cases.filter((entry) => entry.attempts > 0).length;
  return {
    protocolVersion: 1,
    totalCases: safeCases.length,
    attemptedCases,
    unattemptedCases: safeCases.length - attemptedCases,
    totalAttempts: safeResults.length,
    firstPassValidCases,
    firstPassReviewCases,
    blockedCases,
    firstPassValidationRate: attemptedCases ? firstPassValidCases / attemptedCases : 0,
    firstPassReviewRate: attemptedCases ? firstPassReviewCases / attemptedCases : 0,
    averageRepairIterationsForRepairedCases: repairedCases ? totalRepairIterations / repairedCases : 0,
    diagnosticCounts,
    blockerCounts,
    runtimeCounts,
    cases,
  };
}
