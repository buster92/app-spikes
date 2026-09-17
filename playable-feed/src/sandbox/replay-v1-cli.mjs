import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runReplayV1, validateReplayTraceV1 } from "./replay-v1.js";

const specFile = process.argv[2];
const traceFile = process.argv[3];
if (!specFile || !traceFile) {
  console.error("Usage: node src/sandbox/replay-v1-cli.mjs <game-spec-v1.json> <replay.json>");
  process.exitCode = 2;
} else {
  try {
    const spec = JSON.parse(await readFile(resolve(process.cwd(), specFile), "utf8"));
    const trace = JSON.parse(await readFile(resolve(process.cwd(), traceFile), "utf8"));
    const validation = validateReplayTraceV1(spec, trace);
    if (!validation.ok) {
      console.error(JSON.stringify({ ok: false, errors: validation.errors }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(runReplayV1(spec, trace), null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      stage: "replay_v1_cli",
      errors: [error?.message ? String(error.message) : String(error)],
    }, null, 2));
    process.exitCode = 1;
  }
}
