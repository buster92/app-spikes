import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewGameSpecV1 } from "./review-v1.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node src/sandbox/review-v1-cli.mjs <game-spec-v1.json>");
  process.exitCode = 2;
} else {
  try {
    const path = resolve(process.cwd(), file);
    const spec = JSON.parse(await readFile(path, "utf8"));
    const report = reviewGameSpecV1(spec);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      verdict: "reject",
      stage: "review_v1_cli",
      errors: [error?.message ? String(error.message) : String(error)],
    }, null, 2));
    process.exitCode = 1;
  }
}
