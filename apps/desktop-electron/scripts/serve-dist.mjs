/**
 * Zero-dependency static file server for renderer/dist.
 * Compatible with both Windows and WSL Node.js (no native modules).
 */
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(__dirname, "../renderer/dist");
const port = Number(process.env.PORT ?? 5180);

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

createServer((req, res) => {
  let urlPath = req.url.split("?")[0];
  let filePath = join(distDir, urlPath);

  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    // Not found — serve index.html for SPA routing
    filePath = join(distDir, "index.html");
  }

  try {
    statSync(filePath);
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(filePath);
  const contentType = mimeTypes[ext] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`[serve-dist] http://127.0.0.1:${port}`);
});
