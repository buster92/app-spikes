#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTHORING_GRAMMAR_V3 } from "./authoring-grammar-v3.js";
import { getRuntimeCapabilities } from "./creator-tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../..");
const caseId = process.argv[2];
const casesPath = resolve(projectRoot, "creator-pressure/v3-cases.json");
const casesDocument = JSON.parse(await readFile(casesPath, "utf8"));
const pressureCase = (casesDocument.cases || []).find((entry) => entry.id === caseId);

if (!pressureCase) {
  const ids = (casesDocument.cases || []).map((entry) => entry.id).join(", ");
  process.stderr.write(`Usage: node src/sandbox/creator-pressure-v3-packet.mjs <case-id>\nAvailable: ${ids}\n`);
  process.exitCode = 2;
} else {
  const publicFiles = [
    "sandbox/GAMESPEC-AUTHORING-QUICK-REFERENCE.md",
    "sandbox/GAMESPEC-V0.md",
    "sandbox/GAMESPEC-V1-DRAFT.md",
    "sandbox/GAMESPEC-V2-DRAFT.md",
    "sandbox/GAMESPEC-V3-DRAFT.md",
    "sandbox/ai-tools-v3-draft.json",
    "sandbox/game-spec-v0.schema.json",
  ];

  const sections = [];
  for (const relative of publicFiles) {
    sections.push({
      relative,
      content: await readFile(resolve(projectRoot, relative), "utf8"),
    });
  }

  const machineContract = {
    runtimeCapabilities: getRuntimeCapabilities("playloop-2d-v3"),
    authoringGrammar: AUTHORING_GRAMMAR_V3,
  };

  const packet = [
    "# Playloop external AI creator-pressure packet",
    "",
    "You are authoring a Playloop GameSpec from public authoring materials only. Do not assume access to implementation source, hidden APIs, JavaScript execution, network, filesystem, storage, social APIs, payments, or unrestricted device capabilities.",
    "",
    "The runtime ladder is additive: playloop-2d-v3 inherits supported v0, v1 and v2 syntax. Do not declare a capability absent merely because the v3 grid document does not repeat older condition/action syntax.",
    "",
    "Read the machine-readable capabilities/grammar and the quick reference before deciding that a mechanic is blocked. In particular, comparisons are condition objects, and conditional behavior is represented by the supported `if` action with `condition`, `then` and optional `else`.",
    "",
    "Use the smallest runtime tier that can honestly express the requested game. Do not invent fields or opcodes. If the requested mechanic cannot be represented by the published bounded contract after considering inherited composition, return a blocked submission rather than faking support.",
    "",
    "Stay within the published GameSpec byte and operation budgets. A draft that only works by expanding beyond the hard spec-byte budget is not a valid first-pass success.",
    "",
    "Return exactly one raw JSON submission envelope and no prose or Markdown fences. The envelope must have `caseId`, `attempt`, `author`, `status`, `blockers`, and, when status is `submitted`, `spec`.",
    "",
    "For this first attempt set `attempt` to 1 and identify your real provider/model in `author`. Use `status: \"submitted\"` for a GameSpec or `status: \"blocked\"` with concise capability blockers when necessary.",
    "",
    `## Case: ${pressureCase.id}`,
    "",
    `Genre: ${pressureCase.genre}`,
    "",
    pressureCase.prompt,
    "",
    "## Machine-readable runtime capabilities and authoring grammar",
    "",
    "```json",
    JSON.stringify(machineContract, null, 2),
    "```",
    "",
    "## Public authoring materials",
    "",
  ];

  for (const section of sections) {
    packet.push(`### ${section.relative}`, "", "```text", section.content.trimEnd(), "```", "");
  }

  process.stdout.write(`${packet.join("\n")}\n`);
}
