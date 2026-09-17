import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runReplay, validateReplayTrace } from "./replay.js";

const [specFile, traceFile] = process.argv.slice(2);

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

if (!specFile || !traceFile) {
  print({
    ok: false,
    usage: "node src/sandbox/replay-cli.mjs <game-spec.json> <replay.json>",
  });
  process.exitCode = 2;
} else {
  try {
    const spec = JSON.parse(await readFile(resolve(process.cwd(), specFile), "utf8"));
    const trace = JSON.parse(await readFile(resolve(process.cwd(), traceFile), "utf8"));
    const validation = validateReplayTrace(spec, trace);
    if (!validation.ok) {
      print({ ok: false, errors: validation.errors });
      process.exitCode = 1;
    } else {
      print({ ok: true, result: runReplay(spec, trace) });
    }
  } catch (error) {
    print({ ok: false, errors: [error?.message || String(error)] });
    process.exitCode = 1;
  }
}
