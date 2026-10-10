import http from "node:http";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

// Only controlled wishlist faults; never record headers, URLs, tokens or response bodies.
export async function startProxy(config, directory, manifest) {
  const server = http.createServer(async (req, res) => {
    let mode = "none";
    try {
      mode = (await readFile(path.join(directory, "fault"), "utf8")).trim();
    } catch {}
    const url = new URL(req.url, "http://127.0.0.1");
    const wishlist = url.pathname.startsWith("/api/v1/me/wishlist");
    if (
      wishlist &&
      { read: "GET", save: "PUT", remove: "DELETE" }[mode] === req.method
    ) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "UNAVAILABLE",
            message: "QA-only simulated service error",
          },
        }),
      );
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: config.port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        const trace =
          wishlist &&
          req.method === "GET" &&
          url.searchParams.get("subjectType") === "LISTING" &&
          url.searchParams.get("limit") === "50";
        const chunks = [];
        reply.on("data", (bytes) => {
          if (trace) chunks.push(bytes);
        });
        reply.on("end", () => {
          if (!trace) return;
          let page;
          try {
            page = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            return;
          }
          void appendFile(
            path.join(directory, "membership-trace.ndjson"),
            JSON.stringify({
              status: reply.statusCode,
              cursor: url.searchParams.has("cursor"),
              count: page.items?.length ?? null,
              next: !!page.nextCursor,
              target:
                page.items?.some(
                  (item) => item.subjectId === manifest.target,
                ) ?? false,
            }) + "\n",
          ).catch(() => {});
        });
        reply.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port + 2, "127.0.0.1", resolve);
  });
  return () =>
    new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
}
