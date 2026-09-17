import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Normalize away the trailing slash produced by directory file URLs. The
// traversal guard below appends `sep`, so keeping the URL slash would create a
// false `//` prefix and reject every non-root request.
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "127.0.0.1";

const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
});

function resolveRequestPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl || "/", `http://${host}:${port}`).pathname);
  } catch {
    return null;
  }

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

async function fileForRequest(requestUrl) {
  const candidate = resolveRequestPath(requestUrl);
  if (!candidate) return null;

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = resolve(candidate, "index.html");
      const indexInfo = await stat(index);
      return indexInfo.isFile() ? index : null;
    }
    return info.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed\n");
    return;
  }

  const path = await fileForRequest(request.url);
  if (!path) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": MIME[extname(path).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Could not read file: ${error?.message || String(error)}\n`);
  }
});

server.listen(port, host, () => {
  console.log(`Playloop dev server: http://${host}:${port}/`);
  console.log(`Creator Lab: http://${host}:${port}/creator-lab.html`);
  console.log("Press Ctrl+C to stop.");
});
