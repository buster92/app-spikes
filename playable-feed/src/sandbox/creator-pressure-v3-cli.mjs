#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateCreatorPressureAttempt,
  summarizeCreatorPressure,
} from "./creator-pressure-v3.js";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../..");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function collectSubmissionFiles(paths) {
  const files = [];
  for (const input of paths) {
    const absolute = resolve(projectRoot, input);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      const names = (await readdir(absolute))
        .filter((name) => name.endsWith(".json"))
        .sort();
      for (const name of names) files.push(resolve(absolute, name));
    } else {
      files.push(absolute);
    }
  }
  return files;
}

function unknownCaseResult(raw, source) {
  return {
    caseId: raw?.caseId || null,
    attempt: Number.isInteger(Number(raw?.attempt)) ? Number(raw.attempt) : 1,
    author: raw?.author || null,
    status: "invalid_envelope",
    valid: false,
    reviewOk: false,
    verdict: "reject",
    runtime: raw?.spec?.runtime || null,
    specBytes: null,
    blockers: [],
    diagnostics: [{
      severity: "error",
      stage: "pressure_protocol",
      code: "UNKNOWN_CASE",
      path: "caseId",
      message: `Unknown creator-pressure case '${raw?.caseId ?? "<missing>"}' in ${source}`,
    }],
    warnings: [],
  };
}

function extractJsonHint(text, key) {
  const match = String(text).match(new RegExp(`"${key}"\\s*:\\s*"?([^",}\\s]+)`));
  return match?.[1] || null;
}

function formatErrorResult(text, source, error) {
  const fenced = /^\s*```(?:json)?\s*$/im.test(text);
  const caseId = extractJsonHint(text, "caseId");
  const attemptHint = Number(extractJsonHint(text, "attempt"));
  const attempt = Number.isInteger(attemptHint) && attemptHint > 0 ? attemptHint : 1;
  const code = fenced ? "MARKDOWN_FENCE" : "INVALID_JSON";

  return {
    caseId,
    attempt,
    author: null,
    status: "format_error",
    valid: false,
    reviewOk: false,
    verdict: "reject",
    runtime: null,
    specBytes: null,
    blockers: [],
    diagnostics: [{
      severity: "error",
      stage: "pressure_protocol",
      code,
      path: null,
      message: fenced
        ? `Submission ${source} is wrapped in Markdown fences; the pressure protocol requires raw JSON only.`
        : `Submission ${source} is not valid JSON: ${error?.message || String(error)}`,
    }],
    warnings: [],
  };
}

const args = process.argv.slice(2);
const casesArg = args[0] || "creator-pressure/v3-cases.json";
const submissionArgs = args.slice(1);
const casesDocument = await readJson(resolve(projectRoot, casesArg));
const pressureCases = Array.isArray(casesDocument.cases) ? casesDocument.cases : [];

if (!submissionArgs.length) {
  process.stdout.write(`${JSON.stringify({
    protocolVersion: casesDocument.protocolVersion || 1,
    contract: casesDocument.contract || null,
    cases: pressureCases,
    usage: "node src/sandbox/creator-pressure-v3-cli.mjs creator-pressure/v3-cases.json <submission.json|directory> [...]",
  }, null, 2)}\n`);
  process.exit(0);
}

const casesById = new Map(pressureCases.map((pressureCase) => [pressureCase.id, pressureCase]));
const files = await collectSubmissionFiles(submissionArgs);
const results = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    results.push({ ...formatErrorResult(text, file, error), source: file });
    continue;
  }

  const attempts = Array.isArray(document) ? document : [document];
  for (const raw of attempts) {
    const pressureCase = casesById.get(raw?.caseId);
    const result = pressureCase
      ? evaluateCreatorPressureAttempt(raw, pressureCase)
      : unknownCaseResult(raw, file);
    results.push({ ...result, source: file });
  }
}

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: summarizeCreatorPressure(results, pressureCases),
  results,
}, null, 2)}\n`);
