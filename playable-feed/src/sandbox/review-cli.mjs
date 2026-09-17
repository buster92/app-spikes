import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewGameSpec } from "./review.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node src/sandbox/review-cli.mjs <game-spec.json>");
  process.exitCode = 2;
} else {
  try {
    const path = resolve(process.cwd(), file);
    const spec = JSON.parse(await readFile(path, "utf8"));
    const report = reviewGameSpec(spec);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      verdict: "reject",
      stage: "review_cli",
      errors: [error?.message ? String(error.message) : String(error)],
    }, null, 2));
    process.exitCode = 1;
  }
}
