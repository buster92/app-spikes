import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewGameSpecV3 } from "./review-v3.js";

const [file] = process.argv.slice(2);

try {
  if (!file) throw new Error("A GameSpec v3 JSON file is required");
  const spec = JSON.parse(await readFile(resolve(process.cwd(), file), "utf8"));
  const report = reviewGameSpecV3(spec);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
}
