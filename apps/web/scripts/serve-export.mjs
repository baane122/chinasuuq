#!/usr/bin/env node
/**
 * serve-export.mjs — a static server with the SAME resolution rules as Vercel's
 * static export hosting, so the e2e suite fails on a routing mistake instead of
 * on the dev server being forgiving.
 *
 * Rules mirrored deliberately:
 *   · `trailingSlash: true` → /track resolves to /track/index.html
 *   · /admin/login          → /admin/login.html   (Next writes both forms)
 *   · unknown path          → 404.html
 *   · no SPA fallback: a missing page must 404, because a real static host does
 *
 * Usage: node scripts/serve-export.mjs --port 4317 --dir out
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const PORT = Number(arg("port", "4317"));
const ROOT = normalize(join(process.cwd(), arg("dir", "out")));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".apk": "application/vnd.android.package-archive",
};

/** Returns { file } or { redirect } — never a silent fallback. */
function resolveFile(urlPath) {
  // Strip query, decode, and refuse traversal before touching the filesystem.
  const [rawPath, query] = urlPath.split("?");
  let p = decodeURIComponent(rawPath);
  if (!p.startsWith("/")) p = `/${p}`;
  const full = normalize(join(ROOT, p));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  if (!existsSync(full)) return null;
  const st = statSync(full);
  if (st.isDirectory()) {
    // `trailingSlash: true` means /track must be /track/ — Vercel answers 308,
    // and the tests should see the same shape the customer gets. Serving
    // index.html directly here would hide a canonical/trailing-slash mistake.
    if (!p.endsWith("/")) {
      const index = join(full, "index.html");
      if (existsSync(index)) return { redirect: `${p}/${query ? `?${query}` : ""}` };
      return null;
    }
    const index = join(full, "index.html");
    return existsSync(index) ? { file: index } : null;
  }
  return { file: full };
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  const resolved = resolveFile(url);
  if (resolved?.redirect) {
    res.writeHead(308, { location: resolved.redirect });
    res.end();
    return;
  }
  const file = resolved?.file;
  if (!file) {
    const notFound = join(ROOT, "404.html");
    if (existsSync(notFound)) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      createReadStream(notFound).pipe(res);
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    }
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    // Mirrors vercel.json closely enough that a missing file cannot be hidden by
    // a stale browser cache during a run.
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`serve-export: ${ROOT} on http://127.0.0.1:${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
