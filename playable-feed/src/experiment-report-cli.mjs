#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  analyzeExperimentPayloads,
  renderExperimentMarkdown,
} from "./experiment-report.js";

function usage() {
  return [
    "Usage:",
    "  npm run report:experiment -- <export.json> [more.json ...] [--experiment ID] [--format markdown|json] [--out FILE]",
    "",
    "Examples:",
    "  npm run report:experiment -- playloop-events-1.json",
    "  npm run report:experiment -- run-a.json run-b.json --experiment onboarding_value_prop_v1",
    "  npm run report:experiment -- run-a.json run-b.json --format json --out report.json",
  ].join("\n");
}

function parseArgs(argv) {
  const files = [];
  let experimentId = null;
  let format = "markdown";
  let out = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--experiment") {
      experimentId = argv[++index] || null;
      continue;
    }
    if (arg === "--format") {
      format = argv[++index] || "";
      continue;
    }
    if (arg === "--out") {
      out = argv[++index] || null;
      continue;
    }
    if (arg === "--help" || arg === "-h") return { help: true, files, experimentId, format, out };
    if (arg.startsWith("--")) throw new Error("Unknown option: " + arg);
    files.push(arg);
  }

  if (!["markdown", "json"].includes(format)) {
    throw new Error("Unsupported format: " + format);
  }
  return { help: false, files, experimentId, format, out };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.files.length === 0) {
    console.log(usage());
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const payloads = [];
  for (const file of args.files) {
    const path = resolve(file);
    const raw = await readFile(path, "utf8");
    try {
      payloads.push(JSON.parse(raw));
    } catch (error) {
      throw new Error("Invalid JSON in " + file + ": " + error.message);
    }
  }

  const report = analyzeExperimentPayloads(payloads, { experimentId: args.experimentId });
  const output = args.format === "json"
    ? JSON.stringify(report, null, 2) + "\n"
    : renderExperimentMarkdown(report);

  if (args.out) {
    await writeFile(resolve(args.out), output, "utf8");
    console.log("Wrote " + args.out);
    return;
  }
  process.stdout.write(output);
}

main().catch((error) => {
  console.error("Experiment report failed: " + error.message);
  process.exitCode = 1;
});
