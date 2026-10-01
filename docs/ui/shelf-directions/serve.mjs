import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      let route = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (route === "/") route = "/index.html";
      const target = path.resolve(root, "." + route);
      if (!target.startsWith(root + path.sep) || !mime[path.extname(target)]) {
        res.writeHead(404).end();
        return;
      }
      const bytes = await fs.readFile(target);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(target)],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(8090, "127.0.0.1", () => {
    console.log("Shelf directions: http://127.0.0.1:8090/");
  });
