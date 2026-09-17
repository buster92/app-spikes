import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runReplayV3 } from "./replay-v3.js";

const [specFile, traceFile] = process.argv.slice(2);

try {
  if (!specFile || !traceFile) throw new Error("Usage: replay-v3-cli <game-spec-v3.json> <replay.json>");
  const spec = JSON.parse(await readFile(resolve(process.cwd(), specFile), "utf8"));
  const trace = JSON.parse(await readFile(resolve(process.cwd(), traceFile), "utf8"));
  console.log(JSON.stringify(runReplayV3(spec, trace), null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
}
