import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildPublicationCandidate,
  getRuntimeCapabilities,
  simulateForAuthoring,
  validateForAuthoring,
} from "./creator-tools.js";

async function readSpec(file) {
  if (!file) throw new Error("A GameSpec JSON file is required");
  return JSON.parse(await readFile(resolve(process.cwd(), file), "utf8"));
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

const [command, file] = process.argv.slice(2);

try {
  switch (command) {
    case "capabilities":
      print(getRuntimeCapabilities());
      break;
    case "validate": {
      const result = validateForAuthoring(await readSpec(file));
      print(result);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case "simulate": {
      const result = simulateForAuthoring(await readSpec(file));
      print(result);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case "manifest": {
      const result = await buildPublicationCandidate(await readSpec(file));
      print(result);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    default:
      print({
        ok: false,
        usage: [
          "node src/sandbox/creator-cli.mjs capabilities",
          "node src/sandbox/creator-cli.mjs validate <game-spec.json>",
          "node src/sandbox/creator-cli.mjs simulate <game-spec.json>",
          "node src/sandbox/creator-cli.mjs manifest <game-spec.json>",
        ],
      });
      process.exitCode = 2;
  }
} catch (error) {
  print({
    ok: false,
    stage: "creator_cli",
    diagnostics: [{
      severity: "error",
      stage: "creator_cli",
      path: null,
      code: "CLI_ERROR",
      message: error?.message || String(error),
    }],
  });
  process.exitCode = 1;
}
