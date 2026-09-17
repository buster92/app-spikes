#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

  const packet = [
    "# Playloop external AI creator-pressure packet",
    "",
    "You are authoring a Playloop GameSpec from public authoring materials only. Do not assume access to implementation source, hidden APIs, JavaScript execution, network, filesystem, storage, social APIs, payments, or unrestricted device capabilities.",
    "",
    "Use the smallest runtime tier that can honestly express the requested game. Do not invent fields or opcodes. If the requested mechanic cannot be represented by the published bounded contract, return a blocked submission rather than faking support.",
    "",
    "Return exactly one JSON submission envelope and no prose. The envelope must have `caseId`, `attempt`, `author`, `status`, `blockers`, and, when status is `submitted`, `spec`.",
    "",
    "For this first attempt set `attempt` to 1 and identify your real provider/model in `author`. Use `status: \"submitted\"` for a GameSpec or `status: \"blocked\"` with concise capability blockers when necessary.",
    "",
    `## Case: ${pressureCase.id}`,
    "",
    `Genre: ${pressureCase.genre}`,
    "",
    pressureCase.prompt,
    "",
    "## Public authoring materials",
    "",
  ];

  for (const section of sections) {
    packet.push(`### ${section.relative}`, "", "```text", section.content.trimEnd(), "```", "");
  }

  process.stdout.write(`${packet.join("\n")}\n`);
}
